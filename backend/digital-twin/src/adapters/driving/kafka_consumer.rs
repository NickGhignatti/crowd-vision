use std::sync::Arc;

use crate::adapters::metrics::add_provision_duration;
use crate::adapters::topics::BUILDING_REGISTRATION_COMPLETED_TOPIC;
use crate::service::provisioning::Provisioning;
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use twin_schema::RegistrationCompleted;

pub fn spawn(brokers: &str, provisioning: Arc<Provisioning>) -> tokio::task::JoinHandle<()> {
    let brokers = brokers.to_string();
    tokio::spawn(async move {
        let consumer: StreamConsumer = match ClientConfig::new()
            .set("bootstrap.servers", &brokers)
            .set("group.id", "building-registrations-completed")
            .set("enable.auto.commit", "true")
            .create()
        {
            Ok(c) => c,
            Err(e) => {
                log::error!("failed to build the registration consumer: {e:?}");
                return;
            }
        };

        if let Err(e) = consumer.subscribe(&[BUILDING_REGISTRATION_COMPLETED_TOPIC]) {
            log::error!("failed to subscribe to {BUILDING_REGISTRATION_COMPLETED_TOPIC}: {e:?}");
            return;
        }

        let mut stream = consumer.stream();
        while let Some(message) = stream.next().await {
            let payload = match message {
                Ok(m) => m.payload().map(|p| p.to_vec()),
                Err(e) => {
                    log::error!("registration consumer error: {e:?}");
                    continue;
                }
            };
            let Some(payload) = payload else { continue };

            let event: RegistrationCompleted = match serde_json::from_slice(&payload) {
                Ok(e) => e,
                Err(e) => {
                    log::error!("malformed registration-completed event: {e:?}");
                    continue;
                }
            };

            let error = event.failure();
            match provisioning
                .resolve(&event.building_id, error.as_deref())
                .await
            {
                Ok(Some(elapsed)) => {
                    let outcome = if error.is_some() { "failed" } else { "ready" };
                    add_provision_duration(outcome, elapsed);
                }
                Ok(None) => {}
                Err(e) => log::error!(
                    "failed to resolve upload {} after registration completed: {e:?}",
                    event.building_id
                ),
            }
        }
    })
}
