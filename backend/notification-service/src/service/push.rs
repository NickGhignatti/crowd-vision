use std::sync::Arc;

use futures::future::join_all;

use crate::domain::{PushPayload, WebPushSubscription};
use crate::service::ports::{PreferenceStore, PushOutcome, PushSender, SubscriptionStore};

pub struct Push {
    subscriptions: Arc<dyn SubscriptionStore>,
    preferences: Arc<dyn PreferenceStore>,
    sender: Arc<dyn PushSender>,
}

impl Push {
    pub fn new(
        subscriptions: Arc<dyn SubscriptionStore>,
        preferences: Arc<dyn PreferenceStore>,
        sender: Arc<dyn PushSender>,
    ) -> Self {
        Push {
            subscriptions,
            preferences,
            sender,
        }
    }

    pub async fn to_accounts(&self, payload: &PushPayload, account_names: &[String]) {
        if account_names.is_empty() {
            return;
        }
        let subscriptions = match self.subscriptions.find_by_accounts(account_names).await {
            Ok(subscriptions) => subscriptions,
            Err(e) => {
                log::error!("Failed to load push subscriptions: {e:?}");
                return;
            }
        };
        join_all(
            subscriptions
                .iter()
                .map(|subscription| self.deliver(subscription, payload)),
        )
        .await;
    }

    pub async fn to_domain(
        &self,
        payload: &PushPayload,
        domain_name: &str,
        notification_type: Option<&str>,
    ) {
        match self
            .preferences
            .accounts_subscribed_to(domain_name, notification_type)
            .await
        {
            Ok(accounts) => self.to_accounts(payload, &accounts).await,
            Err(e) => log::error!("Failed to resolve subscribers of {domain_name}: {e:?}"),
        }
    }

    async fn deliver(&self, subscription: &WebPushSubscription, payload: &PushPayload) {
        if self.sender.send(subscription, payload).await == PushOutcome::SubscriptionGone
            && let Err(e) = self
                .subscriptions
                .delete_by_endpoint(&subscription.endpoint)
                .await
        {
            log::error!("Failed to drop a dead push subscription: {e:?}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{AccountPreferences, Preference, SubscriptionKeys, TEMPERATURE};
    use crate::service::fakes::{InMemoryPreferences, InMemorySubscriptions, RecordingSender};

    fn subscription(account: &str, endpoint: &str) -> WebPushSubscription {
        WebPushSubscription {
            account_name: account.to_string(),
            endpoint: endpoint.to_string(),
            keys: SubscriptionKeys {
                p256dh: "p".to_string(),
                auth: "a".to_string(),
            },
        }
    }

    fn preferences(
        account: &str,
        domain: &str,
        kind: &str,
        subscribed: bool,
    ) -> AccountPreferences {
        AccountPreferences {
            account_name: account.to_string(),
            domain_name: domain.to_string(),
            preferences: vec![Preference {
                notification_type: kind.to_string(),
                is_subscribed: subscribed,
            }],
            created_at: "1970-01-01T00:00:00.000Z".to_string(),
        }
    }

    struct Fixture {
        push: Push,
        subscriptions: Arc<InMemorySubscriptions>,
        sender: Arc<RecordingSender>,
    }

    fn fixture(sender: RecordingSender, records: Vec<AccountPreferences>) -> Fixture {
        let subscriptions = Arc::new(InMemorySubscriptions::default());
        let preferences = Arc::new(InMemoryPreferences::default());
        *preferences.records.lock().unwrap() = records;
        let sender = Arc::new(sender);
        Fixture {
            push: Push::new(subscriptions.clone(), preferences, sender.clone()),
            subscriptions,
            sender,
        }
    }

    async fn store(fixture: &Fixture, subscriptions: &[WebPushSubscription]) {
        for subscription in subscriptions {
            fixture.subscriptions.upsert(subscription).await.unwrap();
        }
    }

    #[tokio::test]
    async fn no_accounts_means_no_sends() {
        let fixture = fixture(RecordingSender::default(), vec![]);
        fixture
            .push
            .to_accounts(&PushPayload::new(None, None, None), &[])
            .await;
        assert!(fixture.sender.endpoints().is_empty());
    }

    #[tokio::test]
    async fn every_subscription_of_every_named_account_receives_the_payload() {
        let fixture = fixture(RecordingSender::default(), vec![]);
        store(
            &fixture,
            &[
                subscription("ada", "https://push/1"),
                subscription("ada", "https://push/2"),
                subscription("bob", "https://push/3"),
            ],
        )
        .await;

        fixture
            .push
            .to_accounts(&PushPayload::new(None, None, None), &["ada".to_string()])
            .await;

        assert_eq!(
            fixture.sender.endpoints(),
            vec!["https://push/1", "https://push/2"]
        );
    }

    #[tokio::test]
    async fn a_gone_subscription_is_deleted() {
        let fixture = fixture(RecordingSender::with_gone(&["https://push/1"]), vec![]);
        store(&fixture, &[subscription("ada", "https://push/1")]).await;

        fixture
            .push
            .to_accounts(&PushPayload::new(None, None, None), &["ada".to_string()])
            .await;

        assert!(
            fixture
                .subscriptions
                .subscriptions
                .lock()
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn a_failed_send_leaves_the_subscription_in_place() {
        let fixture = fixture(RecordingSender::with_failing(&["https://push/1"]), vec![]);
        store(&fixture, &[subscription("ada", "https://push/1")]).await;

        fixture
            .push
            .to_accounts(&PushPayload::new(None, None, None), &["ada".to_string()])
            .await;

        assert_eq!(fixture.subscriptions.subscriptions.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn one_dead_endpoint_does_not_stop_the_rest_of_the_batch() {
        let fixture = fixture(RecordingSender::with_gone(&["https://push/1"]), vec![]);
        store(
            &fixture,
            &[
                subscription("ada", "https://push/1"),
                subscription("ada", "https://push/2"),
            ],
        )
        .await;

        fixture
            .push
            .to_accounts(&PushPayload::new(None, None, None), &["ada".to_string()])
            .await;

        assert_eq!(
            fixture.sender.endpoints(),
            vec!["https://push/1", "https://push/2"]
        );
        let remaining = fixture.subscriptions.subscriptions.lock().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].endpoint, "https://push/2");
    }

    #[tokio::test]
    async fn a_domain_push_only_reaches_accounts_subscribed_to_that_type() {
        let fixture = fixture(
            RecordingSender::default(),
            vec![
                preferences("ada", "d1", TEMPERATURE, true),
                preferences("bob", "d1", TEMPERATURE, false),
                preferences("cy", "d1", "humidity", true),
                preferences("dee", "d2", TEMPERATURE, true),
            ],
        );
        store(
            &fixture,
            &[
                subscription("ada", "https://push/ada"),
                subscription("bob", "https://push/bob"),
                subscription("cy", "https://push/cy"),
                subscription("dee", "https://push/dee"),
            ],
        )
        .await;

        fixture
            .push
            .to_domain(&PushPayload::new(None, None, None), "d1", Some(TEMPERATURE))
            .await;

        assert_eq!(fixture.sender.endpoints(), vec!["https://push/ada"]);
    }

    #[tokio::test]
    async fn an_unspecified_type_reaches_every_subscriber_of_the_domain() {
        let fixture = fixture(
            RecordingSender::default(),
            vec![
                preferences("ada", "d1", TEMPERATURE, true),
                preferences("cy", "d1", "humidity", true),
            ],
        );
        store(
            &fixture,
            &[
                subscription("ada", "https://push/ada"),
                subscription("cy", "https://push/cy"),
            ],
        )
        .await;

        fixture
            .push
            .to_domain(&PushPayload::new(None, None, None), "d1", None)
            .await;

        assert_eq!(
            fixture.sender.endpoints(),
            vec!["https://push/ada", "https://push/cy"]
        );
    }
}
