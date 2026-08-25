use std::sync::Arc;

use crate::domain::{AccountPreferences, DomainError, PreferenceUpdate, WebPushSubscription};
use crate::service::ports::{PreferenceStore, SubscriptionStore};

pub struct Preferences {
    subscriptions: Arc<dyn SubscriptionStore>,
    preferences: Arc<dyn PreferenceStore>,
}

impl Preferences {
    pub fn new(
        subscriptions: Arc<dyn SubscriptionStore>,
        preferences: Arc<dyn PreferenceStore>,
    ) -> Self {
        Preferences {
            subscriptions,
            preferences,
        }
    }

    pub async fn register_device(
        &self,
        subscription: &WebPushSubscription,
    ) -> Result<(), DomainError> {
        self.subscriptions
            .upsert(subscription)
            .await
            .map_err(DomainError::Internal)
    }

    pub async fn of_account(
        &self,
        account_name: &str,
    ) -> Result<Vec<AccountPreferences>, DomainError> {
        self.preferences
            .find_by_account(account_name)
            .await
            .map_err(DomainError::Internal)
    }

    pub async fn apply(&self, updates: &[PreferenceUpdate]) -> Result<(), DomainError> {
        for update in updates {
            self.preferences
                .set(update)
                .await
                .map_err(DomainError::Internal)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{PreferenceRequest, SubscriptionKeys, TEMPERATURE};
    use crate::service::fakes::{InMemoryPreferences, InMemorySubscriptions};

    fn fixture() -> (
        Preferences,
        Arc<InMemorySubscriptions>,
        Arc<InMemoryPreferences>,
    ) {
        let subscriptions = Arc::new(InMemorySubscriptions::default());
        let preferences = Arc::new(InMemoryPreferences::default());
        (
            Preferences::new(subscriptions.clone(), preferences.clone()),
            subscriptions,
            preferences,
        )
    }

    fn subscription(endpoint: &str) -> WebPushSubscription {
        WebPushSubscription {
            account_name: "ada".to_string(),
            endpoint: endpoint.to_string(),
            keys: SubscriptionKeys {
                p256dh: "p".to_string(),
                auth: "a".to_string(),
            },
        }
    }

    fn request(json: serde_json::Value) -> PreferenceRequest {
        serde_json::from_value(json).unwrap()
    }

    #[tokio::test]
    async fn registering_the_same_endpoint_twice_stores_one_subscription() {
        let (service, store, _) = fixture();
        service
            .register_device(&subscription("https://push/1"))
            .await
            .unwrap();
        service
            .register_device(&subscription("https://push/1"))
            .await
            .unwrap();
        assert_eq!(store.subscriptions.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn repeated_writes_for_the_same_type_do_not_accumulate_duplicates() {
        let (service, _, store) = fixture();
        let updates = request(serde_json::json!({ "enabled": true }))
            .resolve_strict("ada", "d1")
            .unwrap();

        service.apply(&updates).await.unwrap();
        service.apply(&updates).await.unwrap();

        let records = store.records.lock().unwrap();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].preferences.len(), 1);
        assert_eq!(records[0].preferences[0].notification_type, TEMPERATURE);
    }

    #[tokio::test]
    async fn a_later_write_overwrites_the_earlier_flag_for_the_same_type() {
        let (service, _, store) = fixture();
        service
            .apply(
                &request(serde_json::json!({ "enabled": true }))
                    .resolve_strict("ada", "d1")
                    .unwrap(),
            )
            .await
            .unwrap();
        service
            .apply(
                &request(serde_json::json!({ "enabled": false }))
                    .resolve_strict("ada", "d1")
                    .unwrap(),
            )
            .await
            .unwrap();

        let records = store.records.lock().unwrap();
        assert!(!records[0].preferences[0].is_subscribed);
    }

    #[tokio::test]
    async fn distinct_types_coexist_on_one_account_and_domain() {
        let (service, _, store) = fixture();
        let updates =
            request(serde_json::json!({ "types": ["temperature", "humidity"], "enabled": true }))
                .resolve_strict("ada", "d1")
                .unwrap();

        service.apply(&updates).await.unwrap();

        let records = store.records.lock().unwrap();
        assert_eq!(records[0].preferences.len(), 2);
    }

    #[tokio::test]
    async fn reading_preferences_only_returns_the_callers_own_records() {
        let (service, _, store) = fixture();
        service
            .apply(
                &request(serde_json::json!({ "enabled": true }))
                    .resolve_strict("ada", "d1")
                    .unwrap(),
            )
            .await
            .unwrap();
        service
            .apply(
                &request(serde_json::json!({ "enabled": true }))
                    .resolve_strict("bob", "d1")
                    .unwrap(),
            )
            .await
            .unwrap();
        drop(store);

        let found = service.of_account("ada").await.unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].account_name, "ada");
    }
}
