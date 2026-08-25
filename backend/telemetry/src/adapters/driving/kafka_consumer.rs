use crate::adapters::metrics;
use crate::adapters::topics::BUILDING_REGISTRATION_REQUESTED_TOPIC;
use crate::kernel::registration::Registration;
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::message::Message;
use serde_json::Value;
use std::sync::Arc;
use std::time::Instant;
use tokio::task::JoinHandle;

pub const GROUP_ID: &str = "building-registrations";

pub fn spawn(brokers: &str, group_id: &str, registration: Arc<Registration>) -> JoinHandle<()> {
    let brokers = brokers.to_owned();
    let group_id = group_id.to_owned();
    tokio::spawn(async move { run(&brokers, &group_id, registration).await })
}

async fn run(brokers: &str, group_id: &str, registration: Arc<Registration>) {
    let consumer: StreamConsumer = match ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group_id)
        .set("enable.auto.commit", "true")
        .set("auto.offset.reset", "latest")
        .create()
    {
        Ok(consumer) => consumer,
        Err(error) => {
            log::error!("failed to build registration consumer: {error}");
            return;
        }
    };

    if let Err(error) = consumer.subscribe(&[BUILDING_REGISTRATION_REQUESTED_TOPIC]) {
        log::error!("failed to subscribe to registration topic: {error}");
        return;
    }

    let mut stream = consumer.stream();
    while let Some(message) = stream.next().await {
        let message = match message {
            Ok(message) => message,
            Err(error) => {
                log::error!("registration consumer error: {error}");
                continue;
            }
        };

        let Some(payload) = message.payload() else {
            continue;
        };
        let Ok(value) = serde_json::from_slice::<Value>(payload) else {
            log::error!("registration message is not valid json, dropping");
            continue;
        };
        let Some(building_id) = value["buildingId"].as_str().map(str::to_owned) else {
            log::error!("registration message has no buildingId, dropping");
            continue;
        };

        let started = Instant::now();
        let outcome = registration.register_from_event(&building_id, &value).await;
        metrics::record_registration(
            match &outcome {
                Ok(true) => "ready",
                Ok(false) => "failed",
                Err(_) => "unacknowledged",
            },
            started.elapsed(),
        );
        if let Err(error) = outcome {
            log::error!("failed to acknowledge registration of {building_id}: {error}");
        }
    }
}
