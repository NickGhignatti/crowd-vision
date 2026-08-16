use std::sync::Arc;

use futures::StreamExt;

use crate::domain::ALERTS_TEMPERATURE_CHANNEL;
use crate::service::alerts::Alerts;

pub async fn listen(url: &str, alerts: Arc<Alerts>) -> anyhow::Result<()> {
    let mut pubsub = redis::Client::open(url)?.get_async_pubsub().await?;
    pubsub.subscribe(ALERTS_TEMPERATURE_CHANNEL).await?;
    log::info!("[Event] Subscribed to {ALERTS_TEMPERATURE_CHANNEL}");

    let mut messages = pubsub.on_message();
    while let Some(message) = messages.next().await {
        match message.get_payload::<String>() {
            Ok(raw) => alerts.on_temperature_breach(&raw).await,
            Err(e) => log::error!("[Event] Failed to read a temperature alert: {e}"),
        }
    }
    Ok(())
}
