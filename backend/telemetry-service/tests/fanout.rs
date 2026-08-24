mod support;

use futures::StreamExt;
use serde_json::json;
use telemetry_contracts::RAW_CHANNEL;
use telemetry_service::adapters::driven::redis_fanout::RedisFanout;
use telemetry_service::contracts::event::TelemetryEvent;
use telemetry_service::kernel::ports::Fanout;

fn redis_url() -> String {
    std::env::var("REDIS_URL").expect("REDIS_URL is set by docker-compose.test.yml")
}

async fn subscribe(channel: &str) -> redis::aio::PubSub {
    let client = redis::Client::open(redis_url()).unwrap();
    let mut pubsub = client.get_async_pubsub().await.unwrap();
    pubsub.subscribe(channel).await.unwrap();
    pubsub
}

async fn next_message(pubsub: &mut redis::aio::PubSub) -> serde_json::Value {
    let message = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        pubsub.on_message().next(),
    )
    .await
    .expect("a message arrives within 5s")
    .expect("the stream yields a message");
    let payload: String = message.get_payload().unwrap();
    serde_json::from_str(&payload).unwrap()
}

#[tokio::test]
async fn a_telemetry_event_reaches_the_raw_channel() {
    let mut pubsub = subscribe(RAW_CHANNEL).await;
    let fanout = RedisFanout::connect(&redis_url()).await.unwrap();

    fanout
        .publish_telemetry(&[TelemetryEvent {
            metric: "temperature".to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            ts_ms: 1_699_999_000_000,
            value: 21.5,
            payload:
                json!({ "buildingId": "b1", "roomId": "r1", "timestamp": 1, "temperature": 21.5 })
                    .as_object()
                    .cloned()
                    .unwrap(),
            ingested_at_ms: 1_700_000_000_000,
        }])
        .await;

    let body = next_message(&mut pubsub).await;
    assert!(
        body.get("type").is_none(),
        "`type` belongs to a reading, not the tick"
    );
    assert_eq!(body["buildingId"], "b1");
    assert_eq!(body["ingestedAt"], 1_700_000_000_000i64);
    let reading = &body["readings"][0];
    assert_eq!(reading["type"], "temperature");
    assert_eq!(reading["roomId"], "r1");
    assert_eq!(reading["value"], 21.5);
}
