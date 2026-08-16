use std::sync::atomic::{AtomicUsize, Ordering};

use notification_service::adapters::driven::persistence::db;
use notification_service::adapters::driven::persistence::preferences::MongoPreferences;
use notification_service::adapters::driven::persistence::subscriptions::MongoSubscriptions;
use notification_service::domain::{PreferenceUpdate, WebPushSubscription};
use notification_service::service::ports::{PreferenceStore, SubscriptionStore};

static COUNTER: AtomicUsize = AtomicUsize::new(0);

async fn stores() -> (MongoSubscriptions, MongoPreferences) {
    let base =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let suffix = COUNTER.fetch_add(1, Ordering::SeqCst);
    let uri = format!(
        "{}/notification_test_{}",
        base.trim_end_matches('/'),
        suffix
    );
    let database = db::connect(&uri).await.unwrap();
    database.drop().await.unwrap();
    let database = db::connect(&uri).await.unwrap();
    (
        MongoSubscriptions::new(&database),
        MongoPreferences::new(&database),
    )
}

fn subscription(account: &str, endpoint: &str) -> WebPushSubscription {
    WebPushSubscription::new(account, Some(endpoint), Some("p256dh"), Some("auth")).unwrap()
}

fn update(account: &str, domain: &str, kind: &str, enabled: bool) -> PreferenceUpdate {
    PreferenceUpdate::new(account, domain, Some(kind), enabled).unwrap()
}

#[tokio::test]
async fn re_subscribing_the_same_endpoint_replaces_the_stored_row() {
    let (subscriptions, _) = stores().await;

    subscriptions
        .upsert(&subscription("ada", "https://push.example/1"))
        .await
        .unwrap();
    subscriptions
        .upsert(&subscription("grace", "https://push.example/1"))
        .await
        .unwrap();

    assert!(
        subscriptions
            .find_by_accounts(&["ada".to_string()])
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        subscriptions
            .find_by_accounts(&["grace".to_string()])
            .await
            .unwrap()
            .len(),
        1
    );
}

#[tokio::test]
async fn a_gone_endpoint_is_deleted() {
    let (subscriptions, _) = stores().await;
    subscriptions
        .upsert(&subscription("ada", "https://push.example/1"))
        .await
        .unwrap();

    subscriptions
        .delete_by_endpoint("https://push.example/1")
        .await
        .unwrap();

    assert!(
        subscriptions
            .find_by_accounts(&["ada".to_string()])
            .await
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn repeated_writes_for_the_same_type_do_not_accumulate_duplicates() {
    let (_, preferences) = stores().await;

    preferences
        .set(&update("ada", "eng", "temperature", true))
        .await
        .unwrap();
    preferences
        .set(&update("ada", "eng", "temperature", false))
        .await
        .unwrap();

    let stored = preferences.find_by_account("ada").await.unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0].preferences.len(), 1);
    assert!(!stored[0].preferences[0].is_subscribed);
}

#[tokio::test]
async fn distinct_types_coexist_on_one_account_and_domain() {
    let (_, preferences) = stores().await;

    preferences
        .set(&update("ada", "eng", "temperature", true))
        .await
        .unwrap();
    preferences
        .set(&update("ada", "eng", "occupancy", true))
        .await
        .unwrap();

    let stored = preferences.find_by_account("ada").await.unwrap();
    assert_eq!(stored[0].preferences.len(), 2);
}

#[tokio::test]
async fn a_stored_record_carries_a_javascript_shaped_timestamp() {
    let (_, preferences) = stores().await;
    preferences
        .set(&update("ada", "eng", "temperature", true))
        .await
        .unwrap();

    let created_at = preferences.find_by_account("ada").await.unwrap()[0]
        .created_at
        .clone();

    assert_eq!(created_at.len(), 24);
    assert!(created_at.ends_with('Z'));
    assert_eq!(&created_at[10..11], "T");
    assert_eq!(&created_at[19..20], ".");
}

#[tokio::test]
async fn only_subscribed_accounts_of_the_domain_are_returned() {
    let (_, preferences) = stores().await;
    preferences
        .set(&update("ada", "eng", "temperature", true))
        .await
        .unwrap();
    preferences
        .set(&update("grace", "eng", "temperature", false))
        .await
        .unwrap();
    preferences
        .set(&update("linus", "ops", "temperature", true))
        .await
        .unwrap();

    let accounts = preferences
        .accounts_subscribed_to("eng", Some("temperature"))
        .await
        .unwrap();

    assert_eq!(accounts, vec!["ada".to_string()]);
}

#[tokio::test]
async fn without_a_type_every_subscriber_of_the_domain_is_returned() {
    let (_, preferences) = stores().await;
    preferences
        .set(&update("ada", "eng", "temperature", true))
        .await
        .unwrap();
    preferences
        .set(&update("grace", "eng", "occupancy", true))
        .await
        .unwrap();

    let mut accounts = preferences
        .accounts_subscribed_to("eng", None)
        .await
        .unwrap();
    accounts.sort();

    assert_eq!(accounts, vec!["ada".to_string(), "grace".to_string()]);
}
