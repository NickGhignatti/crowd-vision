use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use futures::StreamExt;
use rdkafka::message::Headers;
use serde_json::Value;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use notification::adapters::driven::persistence::db;
use notification::adapters::driven::persistence::preferences::MongoPreferences;
use notification::adapters::driven::persistence::subscriptions::MongoSubscriptions;
use notification::adapters::driven::push::WebPushSender;
use notification::adapters::driven::redis_bus::RedisBus;
use notification::adapters::driven::twin::TwinDirectory;
use notification::adapters::driving::alert_listener;
use notification::domain::{
    ALERTS_DLQ_TOPIC, ALERTS_TOPIC, NOTIFICATIONS_CHANNEL, PreferenceUpdate, WebPushSubscription,
};
use notification::service::alerts::Alerts;
use notification::service::ports::SystemClock;
use notification::service::ports::{Cooldown, PreferenceStore, SubscriptionStore};
use notification::service::push::Push;

static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// Every listener joins the same consumer group on a one-partition topic, so
/// two running at once means one of them is assigned nothing and the other
/// handles both tests' records against the wrong Alerts instance. Tests that
/// spawn a listener hold this for as long as theirs is alive.
static KAFKA_LISTENER: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn brokers() -> String {
    std::env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".to_string())
}

async fn produce(payload: String) {
    let producer: rdkafka::producer::FutureProducer = rdkafka::ClientConfig::new()
        .set("bootstrap.servers", brokers())
        .set("message.timeout.ms", "5000")
        .create()
        .unwrap();
    producer
        .send(
            rdkafka::producer::FutureRecord::to(ALERTS_TOPIC)
                .key("b1:r1")
                .payload(&payload),
            Duration::from_secs(10),
        )
        .await
        .unwrap();
}

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
        let message = tokio::time::timeout(Duration::from_secs(30), pubsub.on_message().next())
            .await
            .ok()
            .flatten()?;
        serde_json::from_str(&message.get_payload::<String>().ok()?).ok()
    })
}

#[tokio::test]
async fn a_breach_produced_while_nobody_listens_is_still_delivered_on_return() {
    let _listener_slot = KAFKA_LISTENER.lock().await;
    let building = unique("b");
    let twin = twin_returning(&building, &["eng"]).await;
    let (alerts, bus) = alerts(twin.uri()).await;

    produce(format!(
        r#"{{"type":"temperature","buildingId":"{building}","roomId":"r1","temperature":31.5,"direction":"high","threshold":25.0,"timestamp":1600000000000}}"#
    ))
    .await;

    let observer = next_notification().await;
    tokio::time::sleep(Duration::from_millis(200)).await;

    let listener = {
        let alerts = alerts.clone();
        tokio::spawn(async move { alert_listener::listen(&brokers(), alerts).await })
    };

    let notification = observer
        .await
        .unwrap()
        .expect("a notification was published");

    assert_eq!(
        notification["message"],
        format!("{building} : r1 is 31.5\u{00b0}C (above maximum)")
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
        .on_breach(&format!(
            r#"{{"type":"temperature","buildingId":"{building}","roomId":"r1","temperature":31.5,"direction":"high","threshold":25.0,"timestamp":1600000000000}}"#
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

/// Consumes the dead-letter topic from the end of what already exists, so a
/// parked record from this test is not confused with one left by another.
async fn dlq_consumer() -> rdkafka::consumer::StreamConsumer {
    // Created up front: subscribing to a topic that does not exist yet fails
    // the first consume with UnknownTopicOrPartition, and waiting it out means
    // waiting for a metadata refresh.
    let admin: rdkafka::admin::AdminClient<_> = rdkafka::ClientConfig::new()
        .set("bootstrap.servers", brokers())
        .create()
        .unwrap();
    admin
        .create_topics(
            &[rdkafka::admin::NewTopic::new(
                ALERTS_DLQ_TOPIC,
                1,
                rdkafka::admin::TopicReplication::Fixed(1),
            )],
            &rdkafka::admin::AdminOptions::new(),
        )
        .await
        .unwrap();

    let consumer: rdkafka::consumer::StreamConsumer = rdkafka::ClientConfig::new()
        .set("bootstrap.servers", brokers())
        .set("group.id", unique("dlq-observer-"))
        // A fresh group on a topic this test just created: earliest cannot pick
        // up anything older than this run, and unlike `latest` it does not race
        // the assignment that a `subscribe` has not completed yet.
        .set("auto.offset.reset", "earliest")
        .create()
        .unwrap();
    rdkafka::consumer::Consumer::subscribe(&consumer, &[ALERTS_DLQ_TOPIC]).unwrap();
    consumer
}

/// Waits for the parked record belonging to `building`, ignoring anything an
/// earlier test in this run left on the topic.
async fn parked_for(
    dlq: &rdkafka::consumer::StreamConsumer,
    building: &str,
) -> (String, Option<String>) {
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let record = dlq.recv().await.unwrap();
            let payload =
                std::str::from_utf8(rdkafka::Message::payload(&record).unwrap_or_default())
                    .unwrap()
                    .to_owned();
            if !payload.contains(building) {
                continue;
            }
            let reason = rdkafka::Message::headers(&record)
                .and_then(|headers| {
                    (0..headers.count())
                        .map(|index| headers.get(index))
                        .find(|header| header.key == "reason")
                })
                .and_then(|header| header.value)
                .map(|value| std::str::from_utf8(value).unwrap().to_owned());
            return (payload, reason);
        }
    })
    .await
    .expect("a record reached the dead-letter topic")
}

#[tokio::test]
async fn an_alert_that_can_never_be_handled_is_parked_rather_than_dropped() {
    let _listener_slot = KAFKA_LISTENER.lock().await;
    let building = unique("b");
    let twin = twin_returning(&building, &["eng"]).await;
    let (alerts, _) = alerts(twin.uri()).await;
    let dlq = dlq_consumer().await;

    // Passes the `type == temperature` filter, then fails to deserialise into
    // a TemperatureAlert: no amount of redelivery makes this parse.
    let poison =
        format!(r#"{{"type":"temperature","buildingId":"{building}","temperature":"warm"}}"#);
    produce(poison.clone()).await;

    let listener = {
        let alerts = alerts.clone();
        tokio::spawn(async move { alert_listener::listen(&brokers(), alerts).await })
    };

    let (payload, reason) = parked_for(&dlq, &building).await;

    assert_eq!(payload, poison);
    assert_eq!(reason.as_deref(), Some("invalid"));

    listener.abort();
}
