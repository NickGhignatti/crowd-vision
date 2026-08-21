use std::sync::Arc;

use futures::{Stream, StreamExt};

use crate::domain::{
    ChatMessage, Citation, Conversation, ConversationSummary, DEFAULT_TITLE, DomainError,
    MAX_MESSAGE_LENGTH, MAX_TITLE_LENGTH, NewMessage, Role, TitleField, validate_text,
};
use crate::service::ports::{AgentClient, AgentEvent, AnswerStream, ConversationStore};

#[derive(Debug)]
pub enum ChatEvent {
    Token(String),
    Done(ChatMessage),
}

pub struct Conversations {
    store: Arc<dyn ConversationStore>,
    agent: Arc<dyn AgentClient>,
    history_limit: usize,
}

impl Conversations {
    pub fn new(
        store: Arc<dyn ConversationStore>,
        agent: Arc<dyn AgentClient>,
        history_limit: usize,
    ) -> Self {
        Conversations {
            store,
            agent,
            history_limit,
        }
    }

    pub async fn create(
        &self,
        user_id: &str,
        title: TitleField<'_>,
    ) -> Result<Conversation, DomainError> {
        let title = match title {
            TitleField::Absent => DEFAULT_TITLE.to_string(),
            TitleField::Present(value) => validate_text(value, "title", MAX_TITLE_LENGTH)?,
        };
        Ok(self.store.create(user_id, &title).await?)
    }

    pub async fn list(&self, user_id: &str) -> Result<Vec<ConversationSummary>, DomainError> {
        Ok(self.store.summaries(user_id).await?)
    }

    pub async fn open(&self, user_id: &str, id: &str) -> Result<Conversation, DomainError> {
        self.store
            .find_owned(user_id, id)
            .await?
            .ok_or_else(DomainError::not_found)
    }

    pub async fn rename(
        &self,
        user_id: &str,
        id: &str,
        title: Option<&str>,
    ) -> Result<Conversation, DomainError> {
        let title = validate_text(title, "title", MAX_TITLE_LENGTH)?;
        self.store
            .rename(user_id, id, &title)
            .await?
            .ok_or_else(DomainError::not_found)
    }

    pub async fn delete(&self, user_id: &str, id: &str) -> Result<(), DomainError> {
        match self.store.delete_owned(user_id, id).await? {
            true => Ok(()),
            false => Err(DomainError::not_found()),
        }
    }

    /// Every failure that can be known before the first token — validation, ownership,
    /// the message cap, an unreachable agent — surfaces as the outer `Err`, so the HTTP
    /// adapter can still answer with a status code. Once the stream is returned the
    /// response has begun and later failures travel as stream items.
    pub async fn send_message(
        &self,
        user_id: &str,
        conversation_id: &str,
        content: Option<&str>,
        claims_header: &str,
    ) -> Result<impl Stream<Item = Result<ChatEvent, DomainError>> + Send + use<>, DomainError>
    {
        let question = validate_text(content, "content", MAX_MESSAGE_LENGTH)?;
        let conversation = self.open(user_id, conversation_id).await?;

        if !conversation.has_room_for_exchange() {
            return Err(DomainError::Conflict(
                "Conversation message limit reached".to_string(),
            ));
        }

        let history = conversation.recent_history(self.history_limit);
        let upstream = self.agent.ask(&question, &history, claims_header).await?;

        Ok(futures::stream::unfold(
            Exchange {
                upstream,
                finished: false,
                answer: Answer {
                    store: self.store.clone(),
                    user_id: user_id.to_string(),
                    conversation_id: conversation_id.to_string(),
                    new_title: conversation.title_from_first_question(&question),
                    question,
                    text: String::new(),
                },
            },
            Exchange::step,
        ))
    }
}

/// The upstream stream is `Send` but not `Sync`, so anything borrowed across an await
/// inside `step` has to live outside it — hence the split between the stream and the
/// plain data the persist step needs.
struct Exchange {
    upstream: AnswerStream,
    answer: Answer,
    finished: bool,
}

struct Answer {
    store: Arc<dyn ConversationStore>,
    user_id: String,
    conversation_id: String,
    question: String,
    new_title: Option<String>,
    text: String,
}

impl Exchange {
    async fn step(mut self) -> Option<(Result<ChatEvent, DomainError>, Self)> {
        if self.finished {
            return None;
        }

        match self.upstream.next().await {
            Some(Ok(AgentEvent::Token(text))) => {
                self.answer.text.push_str(&text);
                Some((Ok(ChatEvent::Token(text)), self))
            }
            Some(Ok(AgentEvent::Done { citations })) => {
                self.finished = true;
                let persisted = self.answer.persist(citations).await.map(ChatEvent::Done);
                Some((persisted, self))
            }
            Some(Err(_)) => {
                self.finished = true;
                Some((
                    Err(DomainError::BadGateway(
                        "agent-service stream ended unexpectedly".to_string(),
                    )),
                    self,
                ))
            }
            // The terminal frame is the only signal that the answer is whole. Without
            // it there is nothing safe to persist, so this is the streaming equivalent
            // of the old shape check on the buffered response.
            None => {
                self.finished = true;
                Some((
                    Err(DomainError::BadGateway(
                        "agent-service returned an invalid response".to_string(),
                    )),
                    self,
                ))
            }
        }
    }
}

impl Answer {
    async fn persist(&self, citations: Vec<Citation>) -> Result<ChatMessage, DomainError> {
        self.store
            .append_exchange(
                &self.user_id,
                &self.conversation_id,
                NewMessage {
                    role: Role::User,
                    content: self.question.clone(),
                    citations: None,
                },
                NewMessage {
                    role: Role::Assistant,
                    content: self.text.clone(),
                    citations: Some(citations),
                },
                self.new_title.as_deref(),
            )
            .await?
            .ok_or_else(DomainError::not_found)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Citation, MAX_MESSAGES, TitleField};
    use crate::service::fakes::{AgentScript, InMemoryConversations, ScriptedAgent};
    use crate::service::ports::AgentEvent;

    fn service(store: Arc<InMemoryConversations>, agent: Arc<ScriptedAgent>) -> Conversations {
        Conversations::new(store, agent, 10)
    }

    async fn collect(
        stream: impl Stream<Item = Result<ChatEvent, DomainError>>,
    ) -> Vec<Result<ChatEvent, DomainError>> {
        Box::pin(stream).collect().await
    }

    fn tokens(events: &[Result<ChatEvent, DomainError>]) -> String {
        events
            .iter()
            .filter_map(|e| match e {
                Ok(ChatEvent::Token(text)) => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }

    fn finished(events: &[Result<ChatEvent, DomainError>]) -> Option<&ChatMessage> {
        events.iter().find_map(|e| match e {
            Ok(ChatEvent::Done(message)) => Some(message),
            _ => None,
        })
    }

    async fn conversation_with(
        store: &InMemoryConversations,
        title: &str,
        messages: usize,
    ) -> Conversation {
        let conversation = store.create("ada", title).await.unwrap();
        for i in 0..messages {
            store
                .append_exchange(
                    "ada",
                    &conversation.id,
                    NewMessage {
                        role: Role::User,
                        content: format!("q{i}"),
                        citations: None,
                    },
                    NewMessage {
                        role: Role::Assistant,
                        content: format!("a{i}"),
                        citations: Some(Vec::new()),
                    },
                    None,
                )
                .await
                .unwrap();
        }
        store
            .find_owned("ada", &conversation.id)
            .await
            .unwrap()
            .unwrap()
    }

    #[tokio::test]
    async fn a_conversation_created_without_a_title_gets_the_default_one() {
        let service = service(
            Arc::new(InMemoryConversations::default()),
            Arc::new(ScriptedAgent::answering("hi")),
        );

        let created = service.create("ada", TitleField::Absent).await.unwrap();
        assert_eq!(created.title, DEFAULT_TITLE);
    }

    #[tokio::test]
    async fn a_null_title_is_a_validation_error_rather_than_the_default() {
        let service = service(
            Arc::new(InMemoryConversations::default()),
            Arc::new(ScriptedAgent::answering("hi")),
        );

        assert!(matches!(
            service.create("ada", TitleField::Present(None)).await,
            Err(DomainError::Validation(m)) if m == "title must be a non-empty string"
        ));
    }

    #[tokio::test]
    async fn a_provided_title_is_trimmed_and_kept() {
        let service = service(
            Arc::new(InMemoryConversations::default()),
            Arc::new(ScriptedAgent::answering("hi")),
        );

        let created = service
            .create("ada", TitleField::Present(Some("  Rooms  ")))
            .await
            .unwrap();
        assert_eq!(created.title, "Rooms");
    }

    #[tokio::test]
    async fn another_accounts_conversation_is_not_found_rather_than_forbidden() {
        let store = Arc::new(InMemoryConversations::default());
        let owned = store.create("ada", DEFAULT_TITLE).await.unwrap();
        let service = service(store, Arc::new(ScriptedAgent::answering("hi")));

        assert!(matches!(
            service.open("bob", &owned.id).await,
            Err(DomainError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn only_the_owners_conversations_are_listed() {
        let store = Arc::new(InMemoryConversations::default());
        store.create("ada", "hers").await.unwrap();
        store.create("bob", "his").await.unwrap();
        let service = service(store, Arc::new(ScriptedAgent::answering("hi")));

        let listed = service.list("ada").await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].title, "hers");
    }

    #[tokio::test]
    async fn renaming_a_conversation_that_is_not_yours_is_not_found() {
        let store = Arc::new(InMemoryConversations::default());
        let owned = store.create("ada", DEFAULT_TITLE).await.unwrap();
        let service = service(store, Arc::new(ScriptedAgent::answering("hi")));

        assert!(matches!(
            service.rename("bob", &owned.id, Some("mine now")).await,
            Err(DomainError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn renaming_validates_the_title_before_touching_the_store() {
        let store = Arc::new(InMemoryConversations::default());
        let owned = store.create("ada", DEFAULT_TITLE).await.unwrap();
        let service = service(store.clone(), Arc::new(ScriptedAgent::answering("hi")));

        assert!(matches!(
            service.rename("ada", &owned.id, Some("   ")).await,
            Err(DomainError::Validation(_))
        ));
        assert_eq!(
            store
                .find_owned("ada", &owned.id)
                .await
                .unwrap()
                .unwrap()
                .title,
            DEFAULT_TITLE
        );
    }

    #[tokio::test]
    async fn deleting_a_conversation_that_is_not_yours_is_not_found() {
        let store = Arc::new(InMemoryConversations::default());
        let owned = store.create("ada", DEFAULT_TITLE).await.unwrap();
        let service = service(store.clone(), Arc::new(ScriptedAgent::answering("hi")));

        assert!(matches!(
            service.delete("bob", &owned.id).await,
            Err(DomainError::NotFound(_))
        ));
        assert!(store.find_owned("ada", &owned.id).await.unwrap().is_some());
    }

    #[tokio::test]
    async fn the_answer_arrives_as_tokens_and_the_stored_message_closes_the_stream() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let agent = Arc::new(ScriptedAgent::new(AgentScript::Stream(vec![
            AgentEvent::Token("Room ".to_string()),
            AgentEvent::Token("B2 is full.".to_string()),
            AgentEvent::Done {
                citations: vec![Citation {
                    chunk_id: "c1".to_string(),
                    document_id: "d1".to_string(),
                    source: "handbook.md".to_string(),
                    section_path: None,
                }],
            },
        ])));
        let service = service(store.clone(), agent);

        let events = collect(
            service
                .send_message("ada", &conversation.id, Some("which room?"), "claims")
                .await
                .unwrap(),
        )
        .await;

        assert_eq!(tokens(&events), "Room B2 is full.");
        let stored = finished(&events).expect("the stream ends with the stored message");
        assert_eq!(stored.content, "Room B2 is full.");
        assert_eq!(stored.role, Role::Assistant);
        assert_eq!(stored.citations.as_ref().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn both_halves_of_the_exchange_are_persisted_once_the_stream_completes() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let service = service(store.clone(), Arc::new(ScriptedAgent::answering("answer")));

        collect(
            service
                .send_message("ada", &conversation.id, Some("question"), "claims")
                .await
                .unwrap(),
        )
        .await;

        let saved = store
            .find_owned("ada", &conversation.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.messages.len(), 2);
        assert_eq!(saved.messages[0].role, Role::User);
        assert_eq!(saved.messages[0].content, "question");
        assert!(saved.messages[0].citations.is_none());
        assert_eq!(saved.messages[1].content, "answer");
    }

    #[tokio::test]
    async fn an_aborted_stream_persists_neither_message() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let agent = Arc::new(ScriptedAgent::new(AgentScript::StreamThenError(vec![
            AgentEvent::Token("half an ans".to_string()),
        ])));
        let service = service(store.clone(), agent);

        let events = collect(
            service
                .send_message("ada", &conversation.id, Some("question"), "claims")
                .await
                .unwrap(),
        )
        .await;

        assert!(matches!(
            events.last(),
            Some(Err(DomainError::BadGateway(m))) if m == "agent-service stream ended unexpectedly"
        ));
        let saved = store
            .find_owned("ada", &conversation.id)
            .await
            .unwrap()
            .unwrap();
        assert!(saved.messages.is_empty());
    }

    #[tokio::test]
    async fn a_stream_that_never_terminates_is_treated_as_an_invalid_response() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let agent = Arc::new(ScriptedAgent::new(AgentScript::Stream(vec![
            AgentEvent::Token("no done frame".to_string()),
        ])));
        let service = service(store.clone(), agent);

        let events = collect(
            service
                .send_message("ada", &conversation.id, Some("question"), "claims")
                .await
                .unwrap(),
        )
        .await;

        assert!(matches!(
            events.last(),
            Some(Err(DomainError::BadGateway(m)))
                if m == "agent-service returned an invalid response"
        ));
        let saved = store
            .find_owned("ada", &conversation.id)
            .await
            .unwrap()
            .unwrap();
        assert!(saved.messages.is_empty());
    }

    #[tokio::test]
    async fn an_unreachable_agent_fails_before_the_stream_opens() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let agent = Arc::new(ScriptedAgent::new(AgentScript::Reject(
            "Could not reach agent-service".to_string(),
        )));
        let service = service(store, agent);

        assert!(matches!(
            service.send_message("ada", &conversation.id, Some("q"), "claims").await.err(),
            Some(DomainError::BadGateway(m)) if m == "Could not reach agent-service"
        ));
    }

    #[tokio::test]
    async fn the_question_history_and_claims_header_are_forwarded_to_the_agent() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 3).await;
        let agent = Arc::new(ScriptedAgent::answering("ok"));
        let service = Conversations::new(store, agent.clone(), 10);

        collect(
            service
                .send_message("ada", &conversation.id, Some("  newest  "), "raw-claims")
                .await
                .unwrap(),
        )
        .await;

        let calls = agent.calls.lock().unwrap();
        assert_eq!(calls[0].question, "newest");
        assert_eq!(calls[0].claims_header, "raw-claims");
        assert_eq!(calls[0].history.len(), 6);
        assert_eq!(calls[0].history[0].content, "q0");
    }

    #[tokio::test]
    async fn only_the_configured_window_of_history_is_forwarded() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 5).await;
        let agent = Arc::new(ScriptedAgent::answering("ok"));
        let service = Conversations::new(store, agent.clone(), 4);

        collect(
            service
                .send_message("ada", &conversation.id, Some("newest"), "claims")
                .await
                .unwrap(),
        )
        .await;

        let calls = agent.calls.lock().unwrap();
        assert_eq!(calls[0].history.len(), 4);
        assert_eq!(calls[0].history[0].content, "q3");
        assert_eq!(calls[0].history[3].content, "a4");
    }

    #[tokio::test]
    async fn a_conversation_at_the_message_cap_is_a_conflict_and_never_reaches_the_agent() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, MAX_MESSAGES / 2).await;
        let agent = Arc::new(ScriptedAgent::answering("ok"));
        let service = Conversations::new(store, agent.clone(), 10);

        assert!(matches!(
            service.send_message("ada", &conversation.id, Some("q"), "claims").await.err(),
            Some(DomainError::Conflict(m)) if m == "Conversation message limit reached"
        ));
        assert!(agent.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn empty_content_is_rejected_before_the_conversation_is_even_loaded() {
        let store = Arc::new(InMemoryConversations::default());
        let agent = Arc::new(ScriptedAgent::answering("ok"));
        let service = Conversations::new(store, agent.clone(), 10);

        assert!(matches!(
            service.send_message("ada", "000000000000000000000009", Some("  "), "claims").await.err(),
            Some(DomainError::Validation(m)) if m == "content must be a non-empty string"
        ));
        assert!(agent.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn messaging_another_accounts_conversation_is_not_found() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let service = service(store, Arc::new(ScriptedAgent::answering("ok")));

        assert!(matches!(
            service
                .send_message("bob", &conversation.id, Some("q"), "claims")
                .await
                .err(),
            Some(DomainError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn the_first_exchange_titles_the_conversation_after_the_question() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, DEFAULT_TITLE, 0).await;
        let service = service(store.clone(), Arc::new(ScriptedAgent::answering("ok")));

        collect(
            service
                .send_message("ada", &conversation.id, Some("which rooms are free?"), "c")
                .await
                .unwrap(),
        )
        .await;

        let saved = store
            .find_owned("ada", &conversation.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.title, "which rooms are free?");
    }

    #[tokio::test]
    async fn a_later_exchange_leaves_the_title_alone() {
        let store = Arc::new(InMemoryConversations::default());
        let conversation = conversation_with(&store, "Rooms", 1).await;
        let service = service(store.clone(), Arc::new(ScriptedAgent::answering("ok")));

        collect(
            service
                .send_message("ada", &conversation.id, Some("and the labs?"), "c")
                .await
                .unwrap(),
        )
        .await;

        let saved = store
            .find_owned("ada", &conversation.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.title, "Rooms");
    }
}
