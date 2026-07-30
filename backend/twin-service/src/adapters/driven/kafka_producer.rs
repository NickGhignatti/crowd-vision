
use std::time::Duration;

use async_trait::async_trait;
use rdkafka::ClientConfig;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::json;

use crate::domain::Building;
use crate::service::ports::RegistrationEvents;

pub const BUILDING_REGISTRATION_REQUESTED_TOPIC: &str = "building-registration-requested";
pub const BUILDING_REGISTRATION_COMPLETED_TOPIC: &str = "building-registration-completed";

const PRODUCE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct KafkaEventProducer {
    producer: Option<FutureProducer>,
}

async fn ensure_topics(brokers: &str) -> anyhow::Result<()> {
    let admin: AdminClient<_> = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .create()?;
    let topics = [
        NewTopic::new(
            BUILDING_REGISTRATION_REQUESTED_TOPIC,
            1,
            TopicReplication::Fixed(1),
        ),
        NewTopic::new(
            BUILDING_REGISTRATION_COMPLETED_TOPIC,
            1,
            TopicReplication::Fixed(1),
        ),
    ];
    for result in admin.create_topics(&topics, &AdminOptions::new()).await? {
        if let Err((topic, code)) = result {
            log::info!("topic {topic} not created ({code:?}); assumed to already exist");
        }
    }
    Ok(())
}

impl KafkaEventProducer {
    pub async fn new(brokers: &str) -> anyhow::Result<Self> {
        ensure_topics(brokers).await?;
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
