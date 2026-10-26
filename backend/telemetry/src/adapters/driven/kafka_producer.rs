use crate::adapters::metrics;
use crate::adapters::topics::{
    ALERTS_TOPIC, BUILDING_REGISTRATION_COMPLETED_TOPIC, BUILDING_REGISTRATION_REQUESTED_TOPIC,
    WIFI_OBSERVATIONS_TOPIC,
};
use crate::kernel::ports::{Alerts, ObservationEvents, RegistrationEvents};
use crate::types::event::AlertPayload;
use async_trait::async_trait;
use rdkafka::ClientConfig;
use rdkafka::admin::{AdminClient, AdminOptions, NewTopic, TopicReplication};
use rdkafka::client::DefaultClientContext;
use rdkafka::producer::{FutureProducer, FutureRecord};
use serde_json::Value;
use std::time::Duration;
use twin_schema::RegistrationCompleted;

const PRODUCE_TIMEOUT: Duration = Duration::from_secs(5);
// A tick is stale within seconds and pseudonymous, so the broker keeps it ten minutes.
const OBSERVATIONS_RETENTION_MS: &str = "600000";

pub struct KafkaEvents {
    producer: FutureProducer,
}

impl KafkaEvents {
    pub async fn connect(brokers: &str) -> anyhow::Result<Self> {
        let producer: FutureProducer = ClientConfig::new()
            .set("bootstrap.servers", brokers)
            .set("message.timeout.ms", "5000")
            // A producer-side retry after a partial ack would otherwise
            // publish the same breach twice.
            .set("enable.idempotence", "true")
            .create()?;
        // Off the start-up path: with Kafka down, topic creation blocks for a minute. Brokers auto-create them anyway.
        let brokers = brokers.to_owned();
        tokio::spawn(async move { ensure_topics(&brokers).await });
        Ok(Self { producer })
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
        NewTopic::new(WIFI_OBSERVATIONS_TOPIC, 1, TopicReplication::Fixed(1))
            .set("retention.ms", OBSERVATIONS_RETENTION_MS),
    ];

    if let Err(error) = admin.create_topics(&topics, &AdminOptions::new()).await {
        log::warn!("topic creation reported: {error}");
    }
}

pub fn alert_key(alert: &AlertPayload) -> String {
    alert.partition_key()
}

pub fn alert_json(alert: &AlertPayload) -> Value {
    serde_json::to_value(alert).expect("an alert always serialises")
}

#[async_trait]
impl RegistrationEvents for KafkaEvents {
    async fn publish_completed(
        &self,
        building_id: &str,
        outcome: Result<(), String>,
    ) -> anyhow::Result<()> {
        let payload = serde_json::to_string(&match &outcome {
            Ok(()) => RegistrationCompleted::ready(building_id),
            Err(error) => RegistrationCompleted::failed(building_id, error),
        })
        .expect("a registration completion always serialises");

        let record = FutureRecord::to(BUILDING_REGISTRATION_COMPLETED_TOPIC)
            .key(building_id)
            .payload(&payload);

        self.producer
            .send(record, PRODUCE_TIMEOUT)
            .await
            .map_err(|(error, _)| anyhow::anyhow!("kafka produce failed: {error}"))?;
        Ok(())
    }
}

#[async_trait]
impl ObservationEvents for KafkaEvents {
    async fn publish_observations(&self, building_id: &str, body: &[u8]) -> anyhow::Result<()> {
        let record = FutureRecord::to(WIFI_OBSERVATIONS_TOPIC)
            .key(building_id)
            .payload(body);

        self.producer
            .send(record, PRODUCE_TIMEOUT)
            .await
            .map_err(|(error, _)| anyhow::anyhow!("kafka produce failed: {error}"))?;
        Ok(())
    }
}

#[async_trait]
impl Alerts for KafkaEvents {
    async fn publish_breach(&self, alert: &AlertPayload) {
        metrics::record_breach(&alert.metric, alert.direction.wire_name());

        let key = alert_key(alert);
        let payload = alert_json(alert).to_string();
        let record = FutureRecord::to(ALERTS_TOPIC).key(&key).payload(&payload);

        match self.producer.send_result(record) {
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
    use crate::types::plugin::BoundDirection;

    fn alert(metric: &str, value: f64, direction: BoundDirection, threshold: f64) -> AlertPayload {
        AlertPayload {
            metric: metric.to_owned(),
            field: metric.to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            building_name: "HQ".to_owned(),
            room_name: "Lab 1".to_owned(),
            value,
            label: metric.to_owned(),
            unit: None,
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

    #[tokio::test]
    async fn an_unreachable_broker_does_not_hold_up_start_up() {
        let started = std::time::Instant::now();
        assert!(KafkaEvents::connect("127.0.0.1:1").await.is_ok());
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn every_room_keys_its_alerts_so_a_partition_keeps_their_order() {
        assert_eq!(
            alert_key(&alert("temperature", 26.0, BoundDirection::Above, 25.0)),
            "b1:r1"
        );
    }
}
