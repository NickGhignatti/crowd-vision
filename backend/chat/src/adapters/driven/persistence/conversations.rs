use async_trait::async_trait;
use futures::TryStreamExt;
use mongodb::bson::{DateTime, doc, oid::ObjectId, to_bson};
use mongodb::options::ReturnDocument;
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

use crate::adapters::driven::persistence::db::CONVERSATIONS;
use crate::domain::{
    ChatMessage, Citation, Conversation, ConversationSummary, NewMessage, Role, iso8601,
};
use crate::service::ports::ConversationStore;

#[derive(Debug, Serialize, Deserialize)]
struct MessageDocument {
    #[serde(rename = "_id")]
    id: ObjectId,
    role: Role,
    content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    citations: Option<Vec<Citation>>,
    #[serde(rename = "createdAt")]
    created_at: DateTime,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConversationDocument {
    #[serde(rename = "_id")]
    id: ObjectId,
    #[serde(rename = "userId")]
    user_id: String,
    title: String,
    #[serde(default)]
    messages: Vec<MessageDocument>,
    #[serde(rename = "createdAt")]
    created_at: DateTime,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime,
}

#[derive(Debug, Deserialize)]
struct SummaryDocument {
    #[serde(rename = "_id")]
    id: ObjectId,
    #[serde(rename = "userId")]
    user_id: String,
    title: String,
    #[serde(rename = "createdAt")]
    created_at: DateTime,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime,
}

/// Every `_id` crosses into the domain as a bare hex string. The bson crate would
/// otherwise render it as `{"$oid": "..."}`, which is not what the API returns —
/// and it applies to embedded messages too, not just the conversation.
impl From<MessageDocument> for ChatMessage {
    fn from(document: MessageDocument) -> Self {
        ChatMessage {
            id: document.id.to_hex(),
            role: document.role,
            content: document.content,
            citations: document.citations,
            created_at: iso8601(document.created_at.timestamp_millis()),
        }
    }
}

impl From<ConversationDocument> for Conversation {
    fn from(document: ConversationDocument) -> Self {
        Conversation {
            id: document.id.to_hex(),
            user_id: document.user_id,
            title: document.title,
            messages: document
                .messages
                .into_iter()
                .map(ChatMessage::from)
                .collect(),
            created_at: iso8601(document.created_at.timestamp_millis()),
            updated_at: iso8601(document.updated_at.timestamp_millis()),
        }
    }
}

impl From<SummaryDocument> for ConversationSummary {
    fn from(document: SummaryDocument) -> Self {
        ConversationSummary {
            id: document.id.to_hex(),
            user_id: document.user_id,
            title: document.title,
            created_at: iso8601(document.created_at.timestamp_millis()),
            updated_at: iso8601(document.updated_at.timestamp_millis()),
        }
    }
}

fn stored(message: NewMessage, created_at: DateTime) -> MessageDocument {
    MessageDocument {
        id: ObjectId::new(),
        role: message.role,
        content: message.content,
        citations: message.citations,
        created_at,
    }
}

pub struct MongoConversations {
    collection: Collection<ConversationDocument>,
}

impl MongoConversations {
    pub fn new(database: &Database) -> Self {
        MongoConversations {
            collection: database.collection(CONVERSATIONS),
        }
    }

    /// An id that is not a valid ObjectId can never match a stored conversation, so it
    /// is a miss — and the service turns every miss into a 404, never a 400.
    fn owned(user_id: &str, id: &str) -> Option<mongodb::bson::Document> {
        ObjectId::parse_str(id)
            .ok()
            .map(|id| doc! { "_id": { "$eq": id }, "userId": { "$eq": user_id } })
    }
}

#[async_trait]
impl ConversationStore for MongoConversations {
    async fn create(&self, user_id: &str, title: &str) -> anyhow::Result<Conversation> {
        let now = DateTime::now();
        let document = ConversationDocument {
            id: ObjectId::new(),
            user_id: user_id.to_string(),
            title: title.to_string(),
            messages: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        self.collection.insert_one(&document).await?;
        Ok(document.into())
    }

    async fn summaries(&self, user_id: &str) -> anyhow::Result<Vec<ConversationSummary>> {
        let cursor = self
            .collection
            .clone_with_type::<SummaryDocument>()
            .find(doc! { "userId": { "$eq": user_id } })
            .projection(doc! { "messages": 0 })
            .sort(doc! { "updatedAt": -1 })
            .await?;
        let documents: Vec<SummaryDocument> = cursor.try_collect().await?;
        Ok(documents
            .into_iter()
            .map(ConversationSummary::from)
            .collect())
    }

    async fn find_owned(&self, user_id: &str, id: &str) -> anyhow::Result<Option<Conversation>> {
        let Some(filter) = Self::owned(user_id, id) else {
            return Ok(None);
        };
        Ok(self
            .collection
            .find_one(filter)
            .await?
            .map(Conversation::from))
    }

    async fn rename(
        &self,
        user_id: &str,
        id: &str,
        title: &str,
    ) -> anyhow::Result<Option<Conversation>> {
        let Some(filter) = Self::owned(user_id, id) else {
            return Ok(None);
        };
        Ok(self
            .collection
            .find_one_and_update(
                filter,
                doc! { "$set": { "title": title, "updatedAt": DateTime::now() } },
            )
            .return_document(ReturnDocument::After)
            .await?
            .map(Conversation::from))
    }

    async fn delete_owned(&self, user_id: &str, id: &str) -> anyhow::Result<bool> {
        let Some(filter) = Self::owned(user_id, id) else {
            return Ok(false);
        };
        Ok(self.collection.delete_one(filter).await?.deleted_count == 1)
    }

    async fn append_exchange(
        &self,
        user_id: &str,
        id: &str,
        user_message: NewMessage,
        assistant_message: NewMessage,
        new_title: Option<&str>,
    ) -> anyhow::Result<Option<ChatMessage>> {
        let Some(filter) = Self::owned(user_id, id) else {
            return Ok(None);
        };

        let now = DateTime::now();
        let user = stored(user_message, now);
        let assistant = stored(assistant_message, now);

        // `updatedAt` has no Mongoose to maintain it any more. listConversations sorts
        // by it, so a write that forgets it stops the list reordering with no error.
        let mut set = doc! { "updatedAt": now };
        if let Some(title) = new_title {
            set.insert("title", title);
        }

        let outcome = self
            .collection
            .update_one(
                filter,
                doc! {
                    "$push": { "messages": { "$each": [to_bson(&user)?, to_bson(&assistant)?] } },
                    "$set": set,
                },
            )
            .await?;

        match outcome.matched_count {
            0 => Ok(None),
            _ => Ok(Some(assistant.into())),
        }
    }
}
