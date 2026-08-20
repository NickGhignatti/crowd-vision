use rdkafka::ClientConfig;
use rdkafka::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use telemetry_service::adapters::driven::kafka_producer::KafkaEvents;
use telemetry_service::adapters::topics::ALERTS_TOPIC;
use telemetry_service::contracts::event::AlertPayload;
use telemetry_service::contracts::plugin::BoundDirection;
use telemetry_service::kernel::ports::Alerts;

fn brokers() -> String {
    std::env::var("KAFKA_BROKERS").expect("KAFKA_BROKERS is set by docker-compose.test.yml")
}

fn consumer(brokers: &str) -> StreamConsumer {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set(
            "group.id",
            format!("test-{}", uuid::Uuid::new_v4().simple()),
        )
        .set("auto.offset.reset", "earliest")
        .create()
        .expect("consumer");
    consumer.subscribe(&[ALERTS_TOPIC]).expect("subscribe");
    consumer
}

async fn wait_for(consumer: &StreamConsumer, room_id: &str) -> (String, serde_json::Value) {
    let deadline = std::time::Duration::from_secs(20);
    tokio::time::timeout(deadline, async {
        loop {
            let message = consumer.recv().await.expect("a record");
            let key = String::from_utf8(message.key().unwrap_or_default().to_vec()).unwrap();
            let payload: serde_json::Value =
                serde_json::from_slice(message.payload().unwrap_or_default()).unwrap();
            if payload["roomId"] == room_id {
                return (key, payload);
            }
        }
    })
    .await
    .expect("the alert arrives within 20s")
}

fn alert(room_id: &str, metric: &str, value: f64, direction: BoundDirection) -> AlertPayload {
    AlertPayload {
        metric: metric.to_owned(),
        building_id: "b1".to_owned(),
        room_id: room_id.to_owned(),
        value,
        direction,
        threshold: 25.0,
        ts_ms: 1_700_000_000_000,
    }
}

#[tokio::test]
async fn a_breach_reaches_the_alerts_topic_keyed_by_building_and_room() {
    let brokers = brokers();
    let producer = KafkaEvents::connect(&brokers).await.unwrap();
    let consumer = consumer(&brokers);
    let room_id = uuid::Uuid::new_v4().simple().to_string();

    producer
        .publish_breach(&alert(&room_id, "temperature", 26.0, BoundDirection::Above))
        .await;

    let (key, body) = wait_for(&consumer, &room_id).await;
    assert_eq!(key, format!("b1:{room_id}"));
    assert_eq!(body["type"], "temperature");
    assert_eq!(body["temperature"], 26.0);
    assert_eq!(body["direction"], "high");
    assert_eq!(body["threshold"], 25.0);
    assert_eq!(body["timestamp"], 1_700_000_000_000i64);
}

#[tokio::test]
async fn a_breach_published_before_anyone_subscribes_is_still_delivered() {
    let brokers = brokers();
    let producer = KafkaEvents::connect(&brokers).await.unwrap();
    let room_id = uuid::Uuid::new_v4().simple().to_string();

    producer
        .publish_breach(&alert(&room_id, "temperature", 26.0, BoundDirection::Above))
        .await;
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    let consumer = consumer(&brokers);
    let (_, body) = wait_for(&consumer, &room_id).await;
    assert_eq!(body["type"], "temperature");
}

#[tokio::test]
async fn a_disabled_producer_never_reaches_the_caller() {
    KafkaEvents::disabled()
        .publish_breach(&alert("r1", "temperature", 26.0, BoundDirection::Above))
        .await;
}
