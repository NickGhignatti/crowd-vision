use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures_util::FutureExt;
use redis::AsyncCommands;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Event, Payload};
use serde_json::Value;
use socket_service::core::subscription::Subscription;
use socket_service::shell::metrics::{
    CHANNEL_NOTIFICATIONS, CHANNEL_TELEMETRY, RELAY_MESSAGES_SKIPPED_TOTAL,
    RELAY_PAYLOAD_BYTES_TOTAL, SOCKETS_EXPIRED_TOTAL, SUBSCRIPTIONS_REJECTED_TOTAL,
    TELEMETRY_RELAYED_TOTAL,
};
use socket_service::shell::server::{redis_url, serve};
use tokio::sync::Mutex;
use tokio::sync::mpsc::{self, UnboundedReceiver};

static SERIALIZE: Mutex<()> = Mutex::const_new(());

fn forbidden() -> &'static str {
    Subscription::Forbidden.reason().unwrap()
}

/// rust_socketio hands ack arguments back wrapped in one array level.
fn ack_body(raw: &Value) -> &Value {
    raw.get(0).unwrap_or(raw)
}

const SETTLE: Duration = Duration::from_millis(300);
const DELIVERY_TIMEOUT: Duration = Duration::from_secs(5);
const SILENCE_TIMEOUT: Duration = Duration::from_millis(800);
const RECONNECT_SETTLE: Duration = Duration::from_secs(3);

async fn start_twin_stub() -> String {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();

    let app = axum::Router::new().route(
        "/domain/{building}",
        axum::routing::get(
            async |axum::extract::Path(building): axum::extract::Path<String>| {
                axum::Json(match building.as_str() {
                    "b1" => vec!["acme".to_string()],
                    _ => Vec::<String>::new(),
                })
            },
        ),
    );

    tokio::spawn(async move { axum::serve(listener, app).await });

    format!("http://{address}")
}

async fn start_server() -> String {
    start_server_with_lifetime(Duration::from_secs(3600)).await
}

async fn start_server_with_lifetime(max_lifetime: Duration) -> String {
    let twin_url = start_twin_stub().await;

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();

    tokio::spawn(serve(
        listener,
        redis_url(),
        twin_url,
        max_lifetime,
        std::future::pending(),
    ));
    tokio::time::sleep(SETTLE).await;

    format!("http://{address}")
}

fn claims_header(domains: &[&str]) -> String {
    let memberships: Vec<Value> = domains
        .iter()
        .map(|domain| serde_json::json!({"domain": domain, "role": "admin"}))
        .collect();
    let claims = serde_json::json!({
        "sub": "u1",
        "accountName": "Ada",
        "memberships": memberships,
    });

    STANDARD.encode(claims.to_string())
}

async fn connect(
    url: &str,
    header: &str,
    event: &'static str,
) -> (Client, UnboundedReceiver<Value>) {
    let (sender, receiver) = mpsc::unbounded_channel();

    let client = ClientBuilder::new(url)
        .opening_header("x-gateway-claims", header)
        .on(event, move |payload, _| {
            let sender = sender.clone();
            async move {
                if let Payload::Text(values) = payload
                    && let Some(first) = values.into_iter().next()
                {
                    let _ = sender.send(first);
                }
            }
            .boxed()
        })
        .connect()
        .await
        .expect("client connects");

    tokio::time::sleep(SETTLE).await;
    (client, receiver)
}

fn telemetry_bytes() -> u64 {
    RELAY_PAYLOAD_BYTES_TOTAL
        .with_label_values(&[CHANNEL_TELEMETRY])
        .get()
}

async fn kill_pubsub_connections() {
    let client = redis::Client::open(redis_url()).unwrap();
    let mut connection = client.get_multiplexed_async_connection().await.unwrap();
    let _: redis::Value = redis::cmd("CLIENT")
        .arg("KILL")
        .arg("TYPE")
        .arg("pubsub")
        .query_async(&mut connection)
        .await
        .unwrap();
}

async fn publish(channel: &str, message: &str) {
    let client = redis::Client::open(redis_url()).unwrap();
    let mut connection = client.get_multiplexed_async_connection().await.unwrap();
    let _: () = connection.publish(channel, message).await.unwrap();
}

async fn next_delivery(receiver: &mut UnboundedReceiver<Value>) -> Value {
    tokio::time::timeout(DELIVERY_TIMEOUT, receiver.recv())
        .await
        .expect("a message is delivered before the timeout")
        .expect("the channel stays open")
}

async fn assert_silent(receiver: &mut UnboundedReceiver<Value>) {
    assert!(
        tokio::time::timeout(SILENCE_TIMEOUT, receiver.recv())
            .await
            .is_err(),
        "expected no delivery"
    );
}

#[tokio::test]
async fn every_metric_series_is_exposed_before_any_traffic() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let body = reqwest::get(format!("{url}/metrics"))
        .await
        .unwrap()
        .text()
        .await
        .unwrap();

    for series in [
        "telemetry_relayed_total",
        "socket_connected_clients",
        "socket_connections_rejected_total",
        r#"notifications_relayed_total{scope="domain"}"#,
        r#"notifications_relayed_total{scope="broadcast"}"#,
        r#"relay_payload_bytes_total{channel="telemetry"}"#,
        r#"relay_payload_bytes_total{channel="notifications"}"#,
        r#"relay_messages_skipped_total{channel="telemetry"}"#,
        r#"relay_messages_skipped_total{channel="notifications"}"#,
        r#"socket_subscriptions_rejected_total{reason="forbidden"}"#,
        r#"socket_subscriptions_rejected_total{reason="lookup_failed"}"#,
    ] {
        assert!(body.contains(series), "missing series: {series}");
    }
}

#[tokio::test]
async fn the_relay_recovers_when_redis_drops_the_subscription() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (client, mut events) = connect(&url, &claims_header(&["acme"]), "notification").await;

    kill_pubsub_connections().await;
    tokio::time::sleep(RECONNECT_SETTLE).await;

    publish("notifications", r#"{"message":"after reconnect"}"#).await;

    assert_eq!(
        next_delivery(&mut events).await["message"],
        "after reconnect",
        "the subscriber must reconnect instead of dying on the first Redis failure"
    );

    client.disconnect().await.unwrap();
}

#[tokio::test]
async fn a_scoped_notification_reaches_only_its_domain() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (member, mut inside) = connect(&url, &claims_header(&["acme"]), "notification").await;
    let (outsider, mut outside) = connect(&url, &claims_header(&["beta"]), "notification").await;

    publish(
        "notifications",
        r#"{"message":"scoped","domainName":"acme"}"#,
    )
    .await;

    assert_eq!(next_delivery(&mut inside).await["message"], "scoped");
    assert_silent(&mut outside).await;

    member.disconnect().await.unwrap();
    outsider.disconnect().await.unwrap();
}

#[tokio::test]
async fn an_unscoped_notification_reaches_every_client() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (first, mut first_events) = connect(&url, &claims_header(&["acme"]), "notification").await;
    let (second, mut second_events) =
        connect(&url, &claims_header(&["beta"]), "notification").await;

    publish("notifications", r#"{"message":"system"}"#).await;

    assert_eq!(next_delivery(&mut first_events).await["message"], "system");
    assert_eq!(next_delivery(&mut second_events).await["message"], "system");

    first.disconnect().await.unwrap();
    second.disconnect().await.unwrap();
}

#[tokio::test]
async fn telemetry_reaches_only_subscribers_of_that_building() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (subscriber, mut subscribed) = connect(&url, &claims_header(&["acme"]), "telemetry").await;
    let (bystander, mut unsubscribed) = connect(&url, &claims_header(&["acme"]), "telemetry").await;

    subscriber.emit("subscribe_building", "b1").await.unwrap();
    tokio::time::sleep(SETTLE).await;

    let payload = r#"{"value":21}"#;
    let relayed_before = TELEMETRY_RELAYED_TOTAL.get();
    let bytes_before = telemetry_bytes();
    publish("telemetry:filtered:b1", payload).await;

    assert_eq!(next_delivery(&mut subscribed).await["value"], 21);
    assert_silent(&mut unsubscribed).await;
    assert_eq!(TELEMETRY_RELAYED_TOTAL.get(), relayed_before + 1);
    assert_eq!(telemetry_bytes(), bytes_before + payload.len() as u64);

    subscriber.disconnect().await.unwrap();
    bystander.disconnect().await.unwrap();
}

#[tokio::test]
async fn subscribing_acknowledges_the_join_before_any_telemetry_is_published() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (client, mut events) = connect(&url, &claims_header(&["acme"]), "telemetry").await;

    let (ack_sender, mut acks) = mpsc::unbounded_channel();
    client
        .emit_with_ack(
            "subscribe_building",
            "b1",
            Duration::from_secs(5),
            move |payload, _| {
                let sender = ack_sender.clone();
                async move {
                    if let Payload::Text(values) = payload {
                        let _ = sender.send(values[0].clone());
                    }
                }
                .boxed()
            },
        )
        .await
        .unwrap();

    let raw = tokio::time::timeout(Duration::from_secs(5), acks.recv())
        .await
        .expect("the subscribe ack arrives")
        .expect("the ack carries a payload");
    let ack = ack_body(&raw);
    assert_eq!(ack["subscribed"], true, "ack payload was {raw}");
    assert_eq!(ack["buildingId"], "b1");

    // No settle sleep: the ack is the proof the room join landed, which is the
    // whole point of acknowledging it.
    publish("telemetry:filtered:b1", r#"{"value":21}"#).await;
    assert_eq!(next_delivery(&mut events).await["value"], 21);

    client.disconnect().await.unwrap();
}

#[tokio::test]
async fn a_refused_subscription_is_acknowledged_with_its_reason() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (client, _events) = connect(&url, &claims_header(&["other"]), "telemetry").await;

    let (ack_sender, mut acks) = mpsc::unbounded_channel();
    client
        .emit_with_ack(
            "subscribe_building",
            "b1",
            Duration::from_secs(5),
            move |payload, _| {
                let sender = ack_sender.clone();
                async move {
                    if let Payload::Text(values) = payload {
                        let _ = sender.send(values[0].clone());
                    }
                }
                .boxed()
            },
        )
        .await
        .unwrap();

    let raw = tokio::time::timeout(Duration::from_secs(5), acks.recv())
        .await
        .expect("a refusal is acknowledged too, not silently dropped")
        .expect("the ack carries a payload");
    let ack = ack_body(&raw);
    assert_eq!(ack["subscribed"], false, "ack payload was {raw}");
    assert_eq!(ack["reason"], forbidden());

    client.disconnect().await.unwrap();
}

#[tokio::test]
async fn unsubscribing_stops_telemetry_for_that_building() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (client, mut events) = connect(&url, &claims_header(&["acme"]), "telemetry").await;

    client.emit("subscribe_building", "b1").await.unwrap();
    tokio::time::sleep(SETTLE).await;
    client.emit("unsubscribe_building", "b1").await.unwrap();
    tokio::time::sleep(SETTLE).await;

    publish("telemetry:filtered:b1", r#"{"value":21}"#).await;

    assert_silent(&mut events).await;
    client.disconnect().await.unwrap();
}

#[tokio::test]
async fn a_connection_without_claims_is_refused_and_receives_nothing() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (error_sender, mut errors) = mpsc::unbounded_channel();
    let (notification_sender, mut notifications) = mpsc::unbounded_channel();

    let client = ClientBuilder::new(&url)
        .on(Event::Error, move |_, _| {
            let sender = error_sender.clone();
            async move {
                let _ = sender.send(Value::Null);
            }
            .boxed()
        })
        .on("notification", move |_, _| {
            let sender = notification_sender.clone();
            async move {
                let _ = sender.send(Value::Null);
            }
            .boxed()
        })
        .connect()
        .await
        .expect("the engine.io transport still opens");

    tokio::time::sleep(SETTLE).await;
    publish("notifications", r#"{"message":"system"}"#).await;

    next_delivery(&mut errors).await;
    assert_silent(&mut notifications).await;

    assert!(
        client.disconnect().await.is_err(),
        "the namespace was never open, so there is nothing to disconnect"
    );
}

#[tokio::test]
async fn a_malformed_message_does_not_stop_the_relay() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (client, mut events) = connect(&url, &claims_header(&["acme"]), "notification").await;

    let skipped_before = RELAY_MESSAGES_SKIPPED_TOTAL
        .with_label_values(&[CHANNEL_NOTIFICATIONS])
        .get();

    publish("notifications", "{not json").await;
    publish("notifications", r#"{"message":"still alive"}"#).await;

    assert_eq!(next_delivery(&mut events).await["message"], "still alive");
    assert_eq!(
        RELAY_MESSAGES_SKIPPED_TOTAL
            .with_label_values(&[CHANNEL_NOTIFICATIONS])
            .get(),
        skipped_before + 1,
        "the dropped message must be visible in metrics, not just the log"
    );

    client.disconnect().await.unwrap();
}

#[tokio::test]
async fn telemetry_is_denied_for_a_building_outside_the_callers_domains() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let (member, mut allowed) = connect(&url, &claims_header(&["acme"]), "telemetry").await;
    let (outsider, mut denied) = connect(&url, &claims_header(&["beta"]), "telemetry").await;

    let forbidden_before = SUBSCRIPTIONS_REJECTED_TOTAL
        .with_label_values(&[forbidden()])
        .get();

    member.emit("subscribe_building", "b1").await.unwrap();
    outsider.emit("subscribe_building", "b1").await.unwrap();
    tokio::time::sleep(SETTLE).await;

    publish("telemetry:filtered:b1", r#"{"value":21}"#).await;

    assert_eq!(next_delivery(&mut allowed).await["value"], 21);
    assert_silent(&mut denied).await;
    assert_eq!(
        SUBSCRIPTIONS_REJECTED_TOTAL
            .with_label_values(&[forbidden()])
            .get(),
        forbidden_before + 1,
        "the subscribe must be refused as forbidden, not as an unreachable directory"
    );

    member.disconnect().await.unwrap();
    outsider.disconnect().await.unwrap();
}

#[tokio::test]
async fn a_socket_is_dropped_once_its_authorised_lifetime_elapses() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server_with_lifetime(Duration::from_millis(800)).await;

    let (client, mut events) = connect(&url, &claims_header(&["acme"]), "telemetry").await;
    client.emit("subscribe_building", "b1").await.unwrap();
    tokio::time::sleep(SETTLE).await;

    let expired_before = SOCKETS_EXPIRED_TOTAL.get();
    publish("telemetry:filtered:b1", r#"{"value":21}"#).await;
    assert_eq!(
        next_delivery(&mut events).await["value"],
        21,
        "the socket must work normally before its lifetime elapses"
    );

    tokio::time::sleep(Duration::from_secs(2)).await;

    assert!(
        SOCKETS_EXPIRED_TOTAL.get() > expired_before,
        "the expiry must be observable in metrics"
    );

    publish("telemetry:filtered:b1", r#"{"value":22}"#).await;
    assert_silent(&mut events).await;
}
