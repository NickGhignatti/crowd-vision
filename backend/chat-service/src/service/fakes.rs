use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;

use crate::domain::{
    ChatMessage, Conversation, ConversationSummary, DomainError, HistoryTurn, NewMessage, iso8601,
};
use crate::service::ports::{AgentClient, AgentEvent, AnswerStream, ConversationStore};

#[derive(Default)]
pub struct InMemoryConversations {
    pub conversations: Mutex<Vec<Conversation>>,
    next_id: AtomicUsize,
}

impl InMemoryConversations {
    fn mint_id(&self) -> String {
        format!("{:024x}", self.next_id.fetch_add(1, Ordering::SeqCst) + 1)
    }

    fn owned_index(&self, stored: &[Conversation], user_id: &str, id: &str) -> Option<usize> {
        stored
            .iter()
            .position(|c| c.id == id && c.user_id == user_id)
    }

    pub fn insert(&self, conversation: Conversation) {
        self.conversations.lock().unwrap().push(conversation);
    }
}

#[async_trait]
impl ConversationStore for InMemoryConversations {
    async fn create(&self, user_id: &str, title: &str) -> anyhow::Result<Conversation> {
        let conversation = Conversation {
            id: self.mint_id(),
            user_id: user_id.to_string(),
            title: title.to_string(),
            messages: Vec::new(),
            created_at: iso8601(0),
            updated_at: iso8601(0),
        };
        self.conversations
            .lock()
            .unwrap()
            .push(conversation.clone());
        Ok(conversation)
    }

    async fn summaries(&self, user_id: &str) -> anyhow::Result<Vec<ConversationSummary>> {
        Ok(self
            .conversations
            .lock()
            .unwrap()
            .iter()
            .filter(|c| c.user_id == user_id)
            .map(|c| ConversationSummary {
                id: c.id.clone(),
                user_id: c.user_id.clone(),
                title: c.title.clone(),
                created_at: c.created_at.clone(),
                updated_at: c.updated_at.clone(),
            })
            .collect())
    }

    async fn find_owned(&self, user_id: &str, id: &str) -> anyhow::Result<Option<Conversation>> {
        let stored = self.conversations.lock().unwrap();
        Ok(self
            .owned_index(&stored, user_id, id)
            .map(|i| stored[i].clone()))
    }

    async fn rename(
        &self,
        user_id: &str,
        id: &str,
        title: &str,
    ) -> anyhow::Result<Option<Conversation>> {
        let mut stored = self.conversations.lock().unwrap();
        let Some(index) = self.owned_index(&stored, user_id, id) else {
            return Ok(None);
        };
        stored[index].title = title.to_string();
        stored[index].updated_at = iso8601(1);
        Ok(Some(stored[index].clone()))
    }

    async fn delete_owned(&self, user_id: &str, id: &str) -> anyhow::Result<bool> {
        let mut stored = self.conversations.lock().unwrap();
        match self.owned_index(&stored, user_id, id) {
            Some(index) => {
                stored.remove(index);
                Ok(true)
            }
            None => Ok(false),
        }
    }

    async fn append_exchange(
        &self,
        user_id: &str,
        id: &str,
        user_message: NewMessage,
        assistant_message: NewMessage,
        new_title: Option<&str>,
    ) -> anyhow::Result<Option<ChatMessage>> {
        let mut stored = self.conversations.lock().unwrap();
        let Some(index) = self.owned_index(&stored, user_id, id) else {
            return Ok(None);
        };

        let stamp = iso8601(1);
        let user = ChatMessage {
            id: self.mint_id(),
            role: user_message.role,
            content: user_message.content,
            citations: user_message.citations,
            created_at: stamp.clone(),
        };
        let assistant = ChatMessage {
            id: self.mint_id(),
            role: assistant_message.role,
            content: assistant_message.content,
            citations: assistant_message.citations,
            created_at: stamp.clone(),
        };

        let conversation = &mut stored[index];
        conversation.messages.push(user);
        conversation.messages.push(assistant.clone());
        conversation.updated_at = stamp;
        if let Some(title) = new_title {
            conversation.title = title.to_string();
        }
        Ok(Some(assistant))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct AgentCall {
    pub question: String,
    pub history: Vec<HistoryTurn>,
    pub claims_header: String,
}

pub enum AgentScript {
    Stream(Vec<AgentEvent>),
    StreamThenError(Vec<AgentEvent>),
    Reject(String),
}

pub struct ScriptedAgent {
    script: AgentScript,
    pub calls: Mutex<Vec<AgentCall>>,
}

impl ScriptedAgent {
    pub fn new(script: AgentScript) -> Self {
        ScriptedAgent {
            script,
            calls: Mutex::new(Vec::new()),
        }
    }

    pub fn answering(text: &str) -> Self {
        ScriptedAgent::new(AgentScript::Stream(vec![
            AgentEvent::Token(text.to_string()),
            AgentEvent::Done {
                answer: None,
                citations: Vec::new(),
            },
        ]))
    }
}

#[async_trait]
impl AgentClient for ScriptedAgent {
    async fn ask(
        &self,
        question: &str,
        history: &[HistoryTurn],
        claims_header: &str,
    ) -> Result<AnswerStream, DomainError> {
        self.calls.lock().unwrap().push(AgentCall {
            question: question.to_string(),
            history: history.to_vec(),
            claims_header: claims_header.to_string(),
        });

        let events = match &self.script {
            AgentScript::Reject(message) => return Err(DomainError::BadGateway(message.clone())),
            AgentScript::Stream(events) => events
                .iter()
                .cloned()
                .map(Ok)
                .collect::<Vec<anyhow::Result<AgentEvent>>>(),
            AgentScript::StreamThenError(events) => events
                .iter()
                .cloned()
                .map(Ok)
                .chain(std::iter::once(Err(anyhow::anyhow!("connection reset"))))
                .collect(),
        };

        Ok(Box::pin(futures::stream::iter(events)))
    }
}
