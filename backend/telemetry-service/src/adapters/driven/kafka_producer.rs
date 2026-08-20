use crate::adapters::metrics;
use crate::adapters::topics::{
    ALERTS_TOPIC, BUILDING_REGISTRATION_COMPLETED_TOPIC, BUILDING_REGISTRATION_REQUESTED_TOPIC,
};
use crate::contracts::event::AlertPayload;
use crate::contracts::plugin::BoundDirection;
use crate::kernel::ports::{Alerts, RegistrationEvents};
use async_trait::async_trait;
use rdkafka::ClientConfig;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::{Value, json};
use std::time::Duration;

const PRODUCE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct KafkaEvents {
    producer: Option<FutureProducer>,
}

impl KafkaEvents {
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
            BUILDING_REGISTRATION_REQUESTED_TOPIC,
            1,
            TopicReplication::Fixed(1),
        ),
        NewTopic::new(ALERTS_TOPIC, 1, TopicReplication::Fixed(1)),
    ];

    if let Err(error) = admin.create_topics(&topics, &AdminOptions::new()).await {
        log::warn!("topic creation reported: {error}");
    }
}

pub fn alert_key(alert: &AlertPayload) -> String {
    format!("{}:{}", alert.building_id, alert.room_id)
}

pub fn alert_json(alert: &AlertPayload) -> Value {
    json!({
        "buildingId": alert.building_id,
        "roomId": alert.room_id,
        alert.metric.clone(): alert.value,
        "type": alert.metric,
        "direction": direction_of(alert),
        "threshold": alert.threshold,
        "timestamp": alert.ts_ms,
    })
}

fn direction_of(alert: &AlertPayload) -> &'static str {
    match alert.direction {
        BoundDirection::Above => "high",
        BoundDirection::Below => "low",
    }
}

#[async_trait]
impl RegistrationEvents for KafkaEvents {
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

#[async_trait]
impl Alerts for KafkaEvents {
    async fn publish_breach(&self, alert: &AlertPayload) {
        metrics::record_breach(&alert.metric, direction_of(alert));

        let Some(producer) = &self.producer else {
            metrics::record_alert_published(ALERTS_TOPIC, "disabled");
            return;
        };

        let key = alert_key(alert);
        let payload = alert_json(alert).to_string();
        let record = FutureRecord::to(ALERTS_TOPIC).key(&key).payload(&payload);

        match producer.send_result(record) {
            Ok(delivery) => {
                tokio::spawn(async move {
                    let outcome = match delivery.await {
                        Ok(Ok(_)) => "ok",
                        Ok(Err((error, _))) => {
                            log::error!("alert delivery failed: {error}");
                            "error"
                        }
                        Err(_) => "cancelled",
                    };
                    metrics::record_alert_published(ALERTS_TOPIC, outcome);
                });
            }
            Err((error, _)) => {
                log::error!("alert could not be queued: {error}");
                metrics::record_alert_published(ALERTS_TOPIC, "error");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn alert(metric: &str, value: f64, direction: BoundDirection, threshold: f64) -> AlertPayload {
        AlertPayload {
            metric: metric.to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            value,
            direction,
            threshold,
            ts_ms: 1_700_000_000_000,
        }
    }

    #[test]
    fn a_high_breach_keeps_the_node_alert_shape() {
        let body = alert_json(&alert("temperature", 26.0, BoundDirection::Above, 25.0));
        assert_eq!(body["buildingId"], "b1");
        assert_eq!(body["roomId"], "r1");
        assert_eq!(body["temperature"], 26.0);
        assert_eq!(body["type"], "temperature");
        assert_eq!(body["direction"], "high");
        assert_eq!(body["threshold"], 25.0);
        assert_eq!(body["timestamp"], 1_700_000_000_000i64);
    }

    #[test]
    fn a_low_breach_reports_the_direction_as_low() {
        let body = alert_json(&alert("temperature", 14.0, BoundDirection::Below, 18.0));
        assert_eq!(body["direction"], "low");
    }

    #[test]
    fn another_metric_names_its_value_field_after_itself() {
        let body = alert_json(&alert("peopleCount", 20.0, BoundDirection::Above, 12.0));
        assert_eq!(body["peopleCount"], 20.0);
        assert_eq!(body["type"], "peopleCount");
    }

    #[test]
    fn every_room_keys_its_alerts_so_a_partition_keeps_their_order() {
        assert_eq!(
            alert_key(&alert("temperature", 26.0, BoundDirection::Above, 25.0)),
            "b1:r1"
        );
    }
}
