//! The `RegistrationEvents` adapter: announces a newly-registered building on
//! Kafka instead of calling sensor-service directly. Publishing only confirms
//! the message reached the broker -- it never waits on whoever consumes it.

use std::time::Duration;

use async_trait::async_trait;
use rdkafka::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::json;

use crate::domain::Building;
use crate::service::ports::RegistrationEvents;

pub const BUILDING_REGISTRATION_REQUESTED_TOPIC: &str = "building-registration-requested";

const PRODUCE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct KafkaEventProducer {
    // `None` in the disabled/test configuration -- mirrors `OutboundConfig`'s
    // `sync_enabled` flag, so the HTTP/cucumber suites (which link a lib build
    // without `service::fakes`) can use the real adapter type as a no-op.
    producer: Option<FutureProducer>,
}

impl KafkaEventProducer {
    pub fn new(brokers: &str) -> anyhow::Result<Self> {
        let producer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .create()?;
        Ok(Self {
            producer: Some(producer),
        })
    }

    pub fn disabled() -> Self {
        Self { producer: None }
    }
}

#[async_trait]
impl RegistrationEvents for KafkaEventProducer {
    async fn publish_requested(&self, building: &Building) -> anyhow::Result<()> {
        let Some(producer) = &self.producer else {
            return Ok(());
        };

        let payload = json!({
            "buildingId": building.id,
            "name": building.name,
            "rooms": building.rooms.iter().map(|r| json!({
                "id": r.id,
                "name": if r.name.trim().is_empty() { r.id.clone() } else { r.name.clone() },
            })).collect::<Vec<_>>(),
        })
        .to_string();

        producer
            .send(
                FutureRecord::to(BUILDING_REGISTRATION_REQUESTED_TOPIC)
                    .key(&building.id)
                    .payload(&payload),
                PRODUCE_TIMEOUT,
            )
            .await
            .map_err(|(e, _)| anyhow::anyhow!(e))?;
        Ok(())
    }
}
