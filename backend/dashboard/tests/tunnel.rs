//! The fan-out, against a real Redis.
//!
//! This is the whole of dashboard's runtime job: subscribe to the raw telemetry
//! channel, decide which building channel a tick belongs on, and republish the
//! bytes untouched. `resolve_channel` is unit-tested in `src/tunnel.rs`, but the
//! loop around it — subscribe, decode, spawn, publish — ran nowhere until this
//! file existed, because a binary-only crate has no library for `tests/` to import.
//!
//! REDIS_URL and MONGO_URI select the servers; CI sets both.

use std::time::Duration;

use dashboard::state::AppState;
use dashboard::tunnel::start_telemetry_tunnel;
use futures::StreamExt;
use mongodb::{Client, Collection, options::ClientOptions};
use telemetry_schema::{RAW_CHANNEL, TelemetryEnvelope};

fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string())
}

/// AppState needs a Mongo collection, but the tunnel never touches it — the
/// preference map it consults is in memory. This is a handle, not a live query.
async fn state_with(preferences: &[(&str, &[&str])]) -> AppState {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://127.0.0.1:27017".to_string());
    let opts = ClientOptions::parse(&uri).await.unwrap();
    let client = Client::with_options(opts).unwrap();
    let col: Collection<dashboard::models::PreferenceDocument> = client
        .database("crowdvision_test")
        .collection("tunnel_prefs");

    let state = AppState::new(col);
    for (building, columns) in preferences {
        state.building_preferences.insert(
            (*building).to_string(),
            columns.iter().map(|c| (*c).to_string()).collect(),
        );
    }
    state
}

fn tick(building_id: &str) -> String {
    serde_json::json!({
        "buildingId": building_id,
        "ingestedAt": 1_700_000_000_000i64,
        "readings": [{"type": "temperature", "roomId": "room-1", "temperature": 21.5}]
    })
    .to_string()
}

/// Subscribes to `channel`, runs `f`, and returns the first message to arrive
/// (or None once `timeout` passes without one).
async fn first_message_on(channel: &str, timeout: Duration, publish: String) -> Option<String> {
    let client = redis::Client::open(redis_url()).unwrap();
    let mut pubsub = client.get_async_pubsub().await.unwrap();
    pubsub.subscribe(channel).await.unwrap();

    // Give the tunnel's own subscription time to land before publishing, or the
    // tick is broadcast to nobody and the test races its own setup.
    tokio::time::sleep(Duration::from_millis(300)).await;

    let mut conn = client.get_multiplexed_async_connection().await.unwrap();
    let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
        .arg(RAW_CHANNEL)
        .arg(&publish)
        .query_async(&mut conn)
        .await;

    let mut stream = pubsub.on_message();
    tokio::time::timeout(timeout, stream.next())
        .await
        .ok()
        .flatten()
        .map(|msg| msg.get_payload::<String>().unwrap())
}

#[tokio::test]
async fn republishes_a_tick_onto_its_buildings_channel_byte_for_byte() {
    let state = state_with(&[("building-1", &["temperature"])]).await;
    start_telemetry_tunnel(&redis_url(), state).await;

    let payload = tick("building-1");
    let envelope: TelemetryEnvelope = serde_json::from_str(&payload).unwrap();

    let got = first_message_on(&envelope.channel(), Duration::from_secs(5), payload.clone()).await;

    let got = got.expect("no tick arrived on the building channel");
    // Byte-for-byte: dashboard relays what telemetry published rather than
    // re-serialising, so a reading's fields stay owned by the plugin that made them.
    assert_eq!(got, payload);
}

#[tokio::test]
async fn drops_a_tick_for_a_building_with_no_preferences() {
    let state = state_with(&[]).await;
    start_telemetry_tunnel(&redis_url(), state).await;

    let payload = tick("unknown-building");
    let envelope: TelemetryEnvelope = serde_json::from_str(&payload).unwrap();

    let got = first_message_on(&envelope.channel(), Duration::from_secs(2), payload).await;

    assert!(
        got.is_none(),
        "a building with no preferences must not be forwarded, got {got:?}"
    );
}

/// A non-envelope message must not kill the loop: the hot path skips it and keeps
/// serving, or one malformed publish would stop every building's telemetry.
#[tokio::test]
async fn survives_a_message_that_is_not_a_tick() {
    let state = state_with(&[("building-1", &["temperature"])]).await;
    start_telemetry_tunnel(&redis_url(), state).await;

    let client = redis::Client::open(redis_url()).unwrap();
    let mut conn = client.get_multiplexed_async_connection().await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
        .arg(RAW_CHANNEL)
        .arg("not a tick envelope")
        .query_async(&mut conn)
        .await;

    let payload = tick("building-1");
    let envelope: TelemetryEnvelope = serde_json::from_str(&payload).unwrap();
    let got = first_message_on(&envelope.channel(), Duration::from_secs(5), payload.clone()).await;

    assert_eq!(
        got.expect("the tunnel stopped after a malformed message"),
        payload
    );
}
