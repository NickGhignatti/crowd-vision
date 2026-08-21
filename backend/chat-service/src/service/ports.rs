use std::pin::Pin;

use async_trait::async_trait;
use futures::Stream;

use crate::domain::{
    ChatMessage, Citation, Conversation, ConversationSummary, DomainError, HistoryTurn, NewMessage,
};

#[async_trait]
pub trait ConversationStore: Send + Sync {
    async fn create(&self, user_id: &str, title: &str) -> anyhow::Result<Conversation>;
    async fn summaries(&self, user_id: &str) -> anyhow::Result<Vec<ConversationSummary>>;
    async fn find_owned(&self, user_id: &str, id: &str) -> anyhow::Result<Option<Conversation>>;
    async fn rename(
        &self,
        user_id: &str,
        id: &str,
        title: &str,
    ) -> anyhow::Result<Option<Conversation>>;
    async fn delete_owned(&self, user_id: &str, id: &str) -> anyhow::Result<bool>;
    /// Appends both halves of one exchange in a single write and returns the stored
    /// assistant message, whose id and timestamp are assigned here. `new_title`
    /// renames the conversation in the same write when the first exchange names it.
    async fn append_exchange(
        &self,
        user_id: &str,
        id: &str,
        user_message: NewMessage,
        assistant_message: NewMessage,
        new_title: Option<&str>,
    ) -> anyhow::Result<Option<ChatMessage>>;
}

#[derive(Debug, Clone, PartialEq)]
pub enum AgentEvent {
    Token(String),
    Done { citations: Vec<Citation> },
}

pub type AnswerStream = Pin<Box<dyn Stream<Item = anyhow::Result<AgentEvent>> + Send>>;

#[async_trait]
pub trait AgentClient: Send + Sync {
    /// Resolves once agent-service has accepted the question and the response headers
    /// are in — every later token arrives on the stream. A failure to reach the agent,
    /// or a non-2xx status, is a `BadGateway` here rather than a stream error.
    async fn ask(
        &self,
        question: &str,
        history: &[HistoryTurn],
        claims_header: &str,
    ) -> Result<AnswerStream, DomainError>;
}
