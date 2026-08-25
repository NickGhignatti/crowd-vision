use async_trait::async_trait;
use futures::TryStreamExt;
use mongodb::bson::doc;
use mongodb::options::ReturnDocument;
use mongodb::{Collection, Database};

use crate::adapters::driven::persistence::db::WEB_PUSH_SUBSCRIPTIONS;
use crate::domain::WebPushSubscription;
use crate::service::ports::SubscriptionStore;

pub struct MongoSubscriptions {
    collection: Collection<WebPushSubscription>,
}

impl MongoSubscriptions {
    pub fn new(database: &Database) -> Self {
        MongoSubscriptions {
            collection: database.collection(WEB_PUSH_SUBSCRIPTIONS),
        }
    }
}

#[async_trait]
impl SubscriptionStore for MongoSubscriptions {
    async fn upsert(&self, subscription: &WebPushSubscription) -> anyhow::Result<()> {
        self.collection
            .find_one_and_replace(
                doc! { "endpoint": { "$eq": &subscription.endpoint } },
                subscription,
            )
            .upsert(true)
            .return_document(ReturnDocument::After)
            .await?;
        Ok(())
    }

    async fn find_by_accounts(
        &self,
        account_names: &[String],
    ) -> anyhow::Result<Vec<WebPushSubscription>> {
        let cursor = self
            .collection
            .find(doc! { "accountName": { "$in": account_names } })
            .await?;
        Ok(cursor.try_collect().await?)
    }

    async fn delete_by_endpoint(&self, endpoint: &str) -> anyhow::Result<()> {
        self.collection
            .delete_one(doc! { "endpoint": { "$eq": endpoint } })
            .await?;
        Ok(())
    }
}
