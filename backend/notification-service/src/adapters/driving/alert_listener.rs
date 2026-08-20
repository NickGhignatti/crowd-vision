use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;

use crate::adapters::metrics;
use crate::domain::{ALERTS_TOPIC, is_temperature_alert};
use crate::service::alerts::Alerts;

pub const GROUP_ID: &str = "notification-service-alerts";

const IN_FLIGHT: usize = 16;
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

pub async fn listen(brokers: &str, alerts: Arc<Alerts>) -> anyhow::Result<()> {
    loop {
        match consume(brokers, alerts.clone()).await {
            Ok(()) => log::warn!("[Event] Alert stream ended, reconnecting"),
            Err(e) => log::error!("[Event] Alert consumer failed: {e}"),
        }
        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

async fn consume(brokers: &str, alerts: Arc<Alerts>) -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", GROUP_ID)
        .set("auto.offset.reset", "earliest")
        .create()?;
    consumer.subscribe(&[ALERTS_TOPIC])?;
    log::info!("[Event] Subscribed to {ALERTS_TOPIC}");

    consumer
        .stream()
        .for_each_concurrent(IN_FLIGHT, |message| {
            let alerts = alerts.clone();
            async move {
                match message {
                    Ok(message) => handle(&alerts, message.payload()).await,
                    Err(e) => log::error!("[Event] Failed to read an alert: {e}"),
                }
            }
        })
        .await;
    Ok(())
}

async fn handle(alerts: &Alerts, payload: Option<&[u8]>) {
    let Some(raw) = payload.and_then(|bytes| std::str::from_utf8(bytes).ok()) else {
        metrics::record_alert_consumed("undecodable");
        return;
    };
    if !is_temperature_alert(raw) {
        metrics::record_alert_consumed("skipped");
        return;
    }
    let outcome = alerts.on_temperature_breach(raw).await;
    metrics::record_alert_consumed(outcome.label());
}
