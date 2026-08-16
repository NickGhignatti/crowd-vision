use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use futures::StreamExt;
use serde_json::Value;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use notification_service::adapters::driven::persistence::db;
use notification_service::adapters::driven::persistence::preferences::MongoPreferences;
use notification_service::adapters::driven::persistence::subscriptions::MongoSubscriptions;
use notification_service::adapters::driven::push::WebPushSender;
use notification_service::adapters::driven::redis_bus::RedisBus;
use notification_service::adapters::driven::twin::TwinDirectory;
use notification_service::adapters::driving::alert_listener;
use notification_service::domain::{
    ALERTS_TEMPERATURE_CHANNEL, NOTIFICATIONS_CHANNEL, PreferenceUpdate, WebPushSubscription,
};
use notification_service::service::alerts::Alerts;
use notification_service::service::ports::SystemClock;
use notification_service::service::ports::{Cooldown, PreferenceStore, SubscriptionStore};
use notification_service::service::push::Push;

static COUNTER: AtomicUsize = AtomicUsize::new(0);

fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string())
}

async fn database() -> mongodb::Database {
    let base =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let suffix = COUNTER.fetch_add(1, Ordering::SeqCst);
    let uri = format!(
        "{}/notification_flow_{}",
        base.trim_end_matches('/'),
        suffix
    );
    let database = db::connect(&uri).await.unwrap();
    database.drop().await.unwrap();
    db::connect(&uri).await.unwrap()
}

async fn alerts(twin_url: String) -> (Arc<Alerts>, Arc<RedisBus>) {
    let database = database().await;
    let subscriptions = Arc::new(MongoSubscriptions::new(&database));
    let preferences = Arc::new(MongoPreferences::new(&database));

    subscriptions
        .upsert(
            &WebPushSubscription::new(
                "ada",
                Some("https://push.example/1"),
                Some("p256dh"),
                Some("auth"),
            )
            .unwrap(),
        )
        .await
        .unwrap();
    preferences
        .set(&PreferenceUpdate::new("ada", "eng", Some("temperature"), true).unwrap())
        .await
        .unwrap();

    let bus = Arc::new(RedisBus::connect(&redis_url()).await.unwrap());
    let push = Arc::new(Push::new(
        subscriptions,
        preferences,
        Arc::new(WebPushSender::new("", "")),
    ));

    (
        Arc::new(Alerts::new(
            bus.clone(),
            bus.clone(),
            Arc::new(TwinDirectory::new(twin_url)),
            push,
            Arc::new(SystemClock),
        )),
        bus,
    )
}

async fn twin_returning(building: &str, domains: &[&str]) -> MockServer {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path(format!("/domain/{building}")))
        .respond_with(ResponseTemplate::new(200).set_body_json(domains))
        .mount(&server)
        .await;
    server
}

fn unique(prefix: &str) -> String {
    format!(
        "{prefix}{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )
}

async fn next_notification() -> tokio::task::JoinHandle<Option<Value>> {
    let mut pubsub = redis::Client::open(redis_url())
        .unwrap()
        .get_async_pubsub()
        .await
        .unwrap();
    pubsub.subscribe(NOTIFICATIONS_CHANNEL).await.unwrap();

    tokio::spawn(async move {
        let message = tokio::time::timeout(Duration::from_secs(5), pubsub.on_message().next())
            .await
            .ok()
            .flatten()?;
        serde_json::from_str(&message.get_payload::<String>().ok()?).ok()
    })
}

#[tokio::test]
async fn a_temperature_breach_on_the_channel_publishes_a_scoped_notification() {
    let building = unique("b");
    let twin = twin_returning(&building, &["eng"]).await;
    let (alerts, bus) = alerts(twin.uri()).await;

    let listener = {
        let alerts = alerts.clone();
        tokio::spawn(async move { alert_listener::listen(&redis_url(), alerts).await })
    };
    tokio::time::sleep(Duration::from_millis(200)).await;

    let observer = next_notification().await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let mut publisher = redis::Client::open(redis_url())
        .unwrap()
        .get_multiplexed_async_connection()
        .await
        .unwrap();
    redis::cmd("PUBLISH")
        .arg(ALERTS_TEMPERATURE_CHANNEL)
        .arg(format!(
            r#"{{"buildingId":"{building}","roomId":"r1","temperature":31.5,"direction":"high"}}"#
        ))
        .query_async::<()>(&mut publisher)
        .await
        .unwrap();

    let notification = observer
        .await
        .unwrap()
        .expect("a notification was published");

    assert_eq!(
        notification["message"],
        format!("{building} : r1 is 31.5°C (above maximum)")
    );
    assert_eq!(notification["type"], "danger");
    assert_eq!(notification["domainName"], "eng");
    assert!(armed(&bus, &format!("temp_alert:{building}:r1")).await);
    listener.abort();
}

async fn armed(bus: &RedisBus, key: &str) -> bool {
    for _ in 0..50 {
        if bus.is_active(key).await.unwrap() {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    false
}

#[tokio::test]
async fn a_second_breach_inside_the_cooldown_publishes_nothing() {
    let building = unique("b");
    let twin = twin_returning(&building, &["eng"]).await;
    let (alerts, bus) = alerts(twin.uri()).await;
    bus.start(&format!("temp_alert:{building}:r1"), 300)
        .await
        .unwrap();

    alerts
        .on_temperature_breach(&format!(
            r#"{{"buildingId":"{building}","roomId":"r1","temperature":31.5}}"#
        ))
        .await;

    assert_eq!(twin.received_requests().await.unwrap().len(), 0);
}

#[tokio::test]
async fn a_cooldown_key_survives_a_round_trip_through_redis() {
    let (_, bus) = alerts("http://unused".to_string()).await;
    let key = format!(
        "temp_alert:fresh:{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );

    assert!(!bus.is_active(&key).await.unwrap());
    bus.start(&key, 300).await.unwrap();
    assert!(bus.is_active(&key).await.unwrap());
}
