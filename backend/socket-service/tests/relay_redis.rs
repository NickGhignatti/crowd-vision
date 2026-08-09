use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use futures::FutureExt;
use redis::AsyncCommands;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Event, Payload};
use serde_json::Value;
use socket_service::metrics::TELEMETRY_RELAYED_TOTAL;
use socket_service::server::{redis_url, serve};
use tokio::sync::Mutex;
use tokio::sync::mpsc::{self, UnboundedReceiver};

static SERIALIZE: Mutex<()> = Mutex::const_new(());

const SETTLE: Duration = Duration::from_millis(300);
const DELIVERY_TIMEOUT: Duration = Duration::from_secs(5);
const SILENCE_TIMEOUT: Duration = Duration::from_millis(800);

async fn start_server() -> String {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();

    tokio::spawn(serve(listener, redis_url(), std::future::pending()));
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
async fn both_metrics_are_exposed_before_any_traffic() {
    let _guard = SERIALIZE.lock().await;
    let url = start_server().await;

    let body = reqwest::get(format!("{url}/metrics"))
        .await
        .unwrap()
        .text()
        .await
        .unwrap();

    assert!(body.contains("telemetry_relayed_total"));
    assert!(body.contains("socket_connected_clients"));
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

    let before = TELEMETRY_RELAYED_TOTAL.get();
    publish("telemetry:filtered:b1", r#"{"value":21}"#).await;

    assert_eq!(next_delivery(&mut subscribed).await["value"], 21);
    assert_silent(&mut unsubscribed).await;
    assert_eq!(TELEMETRY_RELAYED_TOTAL.get(), before + 1);

    subscriber.disconnect().await.unwrap();
    bystander.disconnect().await.unwrap();
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

    publish("notifications", "{not json").await;
    publish("notifications", r#"{"message":"still alive"}"#).await;

    assert_eq!(next_delivery(&mut events).await["message"], "still alive");
    client.disconnect().await.unwrap();
}
