use crate::adapters::topics::BUILDING_REGISTRATION_COMPLETED_TOPIC;
use crate::kernel::ports::RegistrationEvents;
use async_trait::async_trait;
use rdkafka::ClientConfig;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::json;
use std::time::Duration;

const PRODUCE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct KafkaRegistrationEvents {
    producer: Option<FutureProducer>,
}

impl KafkaRegistrationEvents {
    pub async fn connect(brokers: &str) -> anyhow::Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            .create()?;
        ensure_topics(brokers).await;
        Ok(Self {
            producer: Some(producer),
        })
    }

    pub fn disabled() -> Self {
        Self { producer: None }
    }
}

pub async fn ensure_topics(brokers: &str) {
    let admin: AdminClient<DefaultClientContext> = match ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .create()
    {
        Ok(admin) => admin,
        Err(error) => {
            log::error!("failed to build kafka admin client: {error}");
            return;
        }
    };

    let topics = [
        NewTopic::new(
            BUILDING_REGISTRATION_COMPLETED_TOPIC,
            1,
            TopicReplication::Fixed(1),
        ),
        NewTopic::new(
            crate::adapters::topics::BUILDING_REGISTRATION_REQUESTED_TOPIC,
            1,
            TopicReplication::Fixed(1),
        ),
    ];

    if let Err(error) = admin.create_topics(&topics, &AdminOptions::new()).await {
        log::warn!("topic creation reported: {error}");
    }
}

#[async_trait]
impl RegistrationEvents for KafkaRegistrationEvents {
    async fn publish_completed(
        &self,
        building_id: &str,
        outcome: Result<(), String>,
    ) -> anyhow::Result<()> {
        let Some(producer) = &self.producer else {
            return Ok(());
        };

        let payload = match &outcome {
            Ok(()) => json!({ "buildingId": building_id, "status": "ready" }),
            Err(error) => {
                json!({ "buildingId": building_id, "status": "failed", "error": error })
            }
        }
        .to_string();

        let record = FutureRecord::to(BUILDING_REGISTRATION_COMPLETED_TOPIC)
            .key(building_id)
            .payload(&payload);

        producer
            .send(record, PRODUCE_TIMEOUT)
            .await
            .map_err(|(error, _)| anyhow::anyhow!("kafka produce failed: {error}"))?;
        Ok(())
    }
}
