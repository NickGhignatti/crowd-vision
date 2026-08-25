use std::time::Duration;

use crate::adapters::topics::{
    BUILDING_REGISTRATION_COMPLETED_TOPIC, BUILDING_REGISTRATION_REQUESTED_TOPIC,
};
use crate::domain::Building;
use crate::service::ports::RegistrationEvents;
use async_trait::async_trait;
use rdkafka::ClientConfig;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::producer::{FutureProducer, FutureRecord};
use twin_schema::{RegistrationRequest, RegistrationRoom};

/// How long call wait in producer's local queue before giving up (not broker ack timeout or delivery timeout).
const PRODUCE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct KafkaEventProducer {
    producer: Option<FutureProducer>,
}

/// Topic initialization: creates the required topics if they do not exist.
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
    async fn publish_building_registration_request(
        &self,
        building: &Building,
    ) -> anyhow::Result<()> {
        let Some(producer) = &self.producer else {
            return Ok(());
        };

        let payload = serde_json::to_string(&RegistrationRequest {
            building_id: Some(building.id.clone()),
            name: building.name.clone(),
            max_temperature: None,
            rooms: building
                .rooms
                .iter()
                .map(|room| RegistrationRoom {
                    id: room.id.clone(),
                    name: if room.name.trim().is_empty() {
                        room.id.clone()
                    } else {
                        room.name.clone()
                    },
                })
                .collect(),
        })
        .expect("a registration request always serialises");

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
