use async_trait::async_trait;
use futures::TryStreamExt;
use mongodb::bson::{DateTime, Document, doc};
use mongodb::{Collection, Database};
use serde::{Deserialize, Serialize};

use crate::adapters::driven::persistence::db::NOTIFICATION_SUBSCRIPTIONS;
use crate::domain::{AccountPreferences, Preference, PreferenceUpdate, iso8601};
use crate::service::ports::PreferenceStore;

#[derive(Debug, Serialize, Deserialize)]
struct PreferenceDocument {
    #[serde(rename = "accountName")]
    account_name: String,
    #[serde(rename = "domainName")]
    domain_name: String,
    #[serde(default)]
    preferences: Vec<Preference>,
    #[serde(rename = "createdAt", default)]
    created_at: Option<DateTime>,
}

impl From<PreferenceDocument> for AccountPreferences {
    fn from(document: PreferenceDocument) -> Self {
        AccountPreferences {
            account_name: document.account_name,
            domain_name: document.domain_name,
            preferences: document.preferences,
            created_at: document
                .created_at
                .map(|at| iso8601(at.timestamp_millis()))
                .unwrap_or_default(),
        }
    }
}

pub struct MongoPreferences {
    collection: Collection<PreferenceDocument>,
}

impl MongoPreferences {
    pub fn new(database: &Database) -> Self {
        MongoPreferences {
            collection: database.collection(NOTIFICATION_SUBSCRIPTIONS),
        }
    }
}

fn owner(account_name: &str, domain_name: &str) -> Document {
    doc! {
        "accountName": { "$eq": account_name },
        "domainName": { "$eq": domain_name },
    }
}

#[async_trait]
impl PreferenceStore for MongoPreferences {
    async fn find_by_account(&self, account_name: &str) -> anyhow::Result<Vec<AccountPreferences>> {
        let cursor = self
            .collection
            .find(doc! { "accountName": { "$eq": account_name } })
            .await?;
        let documents: Vec<PreferenceDocument> = cursor.try_collect().await?;
        Ok(documents
            .into_iter()
            .map(AccountPreferences::from)
            .collect())
    }

    /// Two writes, not one: `$pull` then `$push` is what makes a repeated write
    /// for the same type idempotent instead of appending a duplicate entry.
    async fn set(&self, update: &PreferenceUpdate) -> anyhow::Result<()> {
        let owner = owner(&update.account_name, &update.domain_name);

        self.collection
            .update_one(
                owner.clone(),
                doc! { "$pull": { "preferences": { "notificationType": &update.notification_type } } },
            )
            .await?;

        self.collection
            .update_one(
                owner,
                doc! {
                    "$setOnInsert": {
                        "accountName": &update.account_name,
                        "domainName": &update.domain_name,
                        "createdAt": DateTime::now(),
                    },
                    "$push": {
                        "preferences": {
                            "notificationType": &update.notification_type,
                            "isSubscribed": update.enabled,
                        }
                    },
                },
            )
            .upsert(true)
            .await?;
        Ok(())
    }

    async fn accounts_subscribed_to(
        &self,
        domain_name: &str,
        notification_type: Option<&str>,
    ) -> anyhow::Result<Vec<String>> {
        let mut elem_match = doc! { "isSubscribed": true };
        if let Some(notification_type) = notification_type {
            elem_match.insert("notificationType", notification_type);
        }

        let cursor = self
            .collection
            .find(doc! {
                "domainName": { "$eq": domain_name },
                "preferences": { "$elemMatch": elem_match },
            })
            .await?;
        let documents: Vec<PreferenceDocument> = cursor.try_collect().await?;

        let mut accounts: Vec<String> = Vec::new();
        for document in documents {
            if !accounts.contains(&document.account_name) {
                accounts.push(document.account_name);
            }
        }
        Ok(accounts)
    }
}
