mod support;

use rdkafka::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::{Value, json};
use std::sync::Arc;
use std::time::Duration;
use support::fakes::StubEvents;
use support::{fresh_db, seed_building};
use telemetry::adapters::driven::kafka_producer::{KafkaEvents, ensure_topics};
use telemetry::adapters::driven::postgres::{PgBuildings, PgThresholds};
use telemetry::adapters::driving::kafka_consumer;
use telemetry::adapters::topics::{
    BUILDING_REGISTRATION_COMPLETED_TOPIC, BUILDING_REGISTRATION_REQUESTED_TOPIC,
};
use telemetry::kernel::ports::{BuildingStore, RegistrationEvents, ThresholdStore};
use telemetry::kernel::registration::Registration;

static ONE_CONSUMER_AT_A_TIME: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn brokers() -> String {
    std::env::var("KAFKA_BROKERS").expect("KAFKA_BROKERS is set by docker-compose.test.yml")
}

fn unique_group() -> String {
    format!("test-{}", uuid::Uuid::new_v4().simple())
}

fn producer() -> FutureProducer {
    ClientConfig::new()
        .set("bootstrap.servers", brokers())
        .set("message.timeout.ms", "5000")
        .create()
        .unwrap()
}

fn completions(group: &str) -> StreamConsumer {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers())
        .set("group.id", group)
        .set("auto.offset.reset", "earliest")
        .set("enable.auto.commit", "true")
        .create()
        .unwrap();
    consumer
        .subscribe(&[BUILDING_REGISTRATION_COMPLETED_TOPIC])
        .unwrap();
    consumer
}

async fn next_completion(consumer: &StreamConsumer, building_id: &str) -> Value {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    loop {
        let message = tokio::time::timeout_at(deadline, consumer.recv())
            .await
            .expect("a completion arrives within 30s")
            .expect("the consumer yields a message");
        let payload = message.payload().unwrap_or_default();
        let value: Value = serde_json::from_slice(payload).unwrap();
        if value["buildingId"] == building_id {
            return value;
        }
    }
}

async fn request(building_id: &str, body: Value) {
    producer()
        .send(
            FutureRecord::to(BUILDING_REGISTRATION_REQUESTED_TOPIC)
                .key(building_id)
                .payload(&body.to_string()),
            Duration::from_secs(5),
        )
        .await
        .unwrap();
}

fn registration(pool: sqlx::PgPool, events: Arc<dyn RegistrationEvents>) -> Arc<Registration> {
    Arc::new(Registration {
        buildings: Arc::new(PgBuildings::new(pool.clone())) as Arc<dyn BuildingStore>,
        thresholds: Arc::new(PgThresholds::new(pool)) as Arc<dyn ThresholdStore>,
        events,
    })
}

#[tokio::test]
async fn a_registration_request_persists_the_building_and_acknowledges_ready() {
    let _consumer_slot = ONE_CONSUMER_AT_A_TIME.lock().await;
    ensure_topics(&brokers()).await;
    let pool = fresh_db("kafka_ready").await;
    let events = Arc::new(KafkaEvents::connect(&brokers()).await.unwrap());
    let group = unique_group();
    let completions = completions(&format!("{group}-watch"));

    let handle = kafka_consumer::spawn(&brokers(), &group, registration(pool.clone(), events));
    tokio::time::sleep(Duration::from_secs(5)).await;

    request(
        "kb1",
        json!({
            "buildingId": "kb1", "name": "HQ",
            "rooms": [{ "id": "r1", "name": "Lobby" }],
            "maxTemperature": 26.5
        }),
    )
    .await;

    let completion = next_completion(&completions, "kb1").await;
    assert_eq!(completion["status"], "ready");

    let name: String = sqlx::query_scalar("select name from buildings where id = 'kb1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(name, "HQ");

    let bounds = PgThresholds::new(pool.clone())
        .building_bounds("kb1", "temperature")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(bounds["maxTemp"], 26.5);

    handle.abort();
    let _ = handle.await;
}

#[tokio::test]
async fn a_redelivered_registration_request_converges_and_acknowledges_again() {
    let _consumer_slot = ONE_CONSUMER_AT_A_TIME.lock().await;
    ensure_topics(&brokers()).await;
    let pool = fresh_db("kafka_redeliver").await;
    let events = Arc::new(KafkaEvents::connect(&brokers()).await.unwrap());
    let group = unique_group();
    let completions = completions(&format!("{group}-watch"));

    let handle = kafka_consumer::spawn(&brokers(), &group, registration(pool.clone(), events));
    tokio::time::sleep(Duration::from_secs(5)).await;

    let body = json!({
        "buildingId": "kb2", "name": "HQ",
        "rooms": [{ "id": "r1", "name": "Lobby" }]
    });
    request("kb2", body.clone()).await;
    assert_eq!(
        next_completion(&completions, "kb2").await["status"],
        "ready"
    );

    request("kb2", body).await;
    assert_eq!(
        next_completion(&completions, "kb2").await["status"],
        "ready"
    );

    let rooms: i64 =
        sqlx::query_scalar("select count(*) from building_rooms where building_id = 'kb2'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(rooms, 1);

    handle.abort();
    let _ = handle.await;
}

#[tokio::test]
async fn a_registration_that_cannot_be_persisted_acknowledges_failed_with_the_error() {
    let _consumer_slot = ONE_CONSUMER_AT_A_TIME.lock().await;
    ensure_topics(&brokers()).await;
    let pool = fresh_db("kafka_failed").await;
    let events = Arc::new(KafkaEvents::connect(&brokers()).await.unwrap());
    let group = unique_group();
    let completions = completions(&format!("{group}-watch"));

    let handle = kafka_consumer::spawn(&brokers(), &group, registration(pool.clone(), events));
    tokio::time::sleep(Duration::from_secs(5)).await;

    request("kb3", json!({ "buildingId": "kb3", "rooms": [] })).await;

    let completion = next_completion(&completions, "kb3").await;
    assert_eq!(completion["status"], "failed");
    assert!(completion["error"].as_str().unwrap().contains("name"));

    handle.abort();
    let _ = handle.await;
}

#[tokio::test]
async fn a_malformed_message_is_dropped_without_killing_the_consumer() {
    let _consumer_slot = ONE_CONSUMER_AT_A_TIME.lock().await;
    ensure_topics(&brokers()).await;
    let pool = fresh_db("kafka_poison").await;
    seed_building(&pool, "seeded", &[]).await;
    let events = Arc::new(KafkaEvents::connect(&brokers()).await.unwrap());
    let group = unique_group();
    let completions = completions(&format!("{group}-watch"));

    let handle = kafka_consumer::spawn(&brokers(), &group, registration(pool.clone(), events));
    tokio::time::sleep(Duration::from_secs(5)).await;

    producer()
        .send(
            FutureRecord::to(BUILDING_REGISTRATION_REQUESTED_TOPIC)
                .key("kb4")
                .payload("not json at all"),
            Duration::from_secs(5),
        )
        .await
        .unwrap();

    request(
        "kb4",
        json!({ "buildingId": "kb4", "name": "Still Alive", "rooms": [] }),
    )
    .await;

    assert_eq!(
        next_completion(&completions, "kb4").await["status"],
        "ready"
    );
    handle.abort();
    let _ = handle.await;
}

#[tokio::test]
async fn a_disabled_producer_publishes_nothing_and_succeeds() {
    let events = KafkaEvents::disabled();
    events.publish_completed("b1", Ok(())).await.unwrap();
    events
        .publish_completed("b1", Err("boom".to_owned()))
        .await
        .unwrap();

    let stub = StubEvents;
    stub.publish_completed("b1", Ok(())).await.unwrap();
}
