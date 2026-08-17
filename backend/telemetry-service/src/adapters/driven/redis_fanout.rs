use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::plugin::{BoundDirection, ENVELOPE_FIELDS};
use crate::kernel::ports::{Alerts, Fanout};
use async_trait::async_trait;
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use serde_json::{Map, Value, json};
use tokio::sync::Mutex;

pub const RAW_CHANNEL: &str = "telemetry:raw";

pub struct RedisFanout {
    connection: Mutex<MultiplexedConnection>,
}

impl RedisFanout {
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(url)?;
        let connection = client.get_multiplexed_async_connection().await?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    async fn publish(&self, channel: &str, payload: &Value) {
        let mut connection = self.connection.lock().await;
        let published: redis::RedisResult<()> =
            connection.publish(channel, payload.to_string()).await;
        if let Err(error) = published {
            log::error!("failed to publish on {channel}: {error}");
        }
    }
}

fn telemetry_json(event: &TelemetryEvent) -> Value {
    let mut body = Map::new();
    body.insert("type".to_owned(), json!(event.metric));
    body.insert("buildingId".to_owned(), json!(event.building_id));
    body.insert("roomId".to_owned(), json!(event.room_id));
    body.insert("timestamp".to_owned(), json!(event.ts_ms));
    body.insert("value".to_owned(), json!(event.value));
    for (key, value) in &event.payload {
        if !ENVELOPE_FIELDS.contains(&key.as_str()) {
            body.insert(key.clone(), value.clone());
        }
    }
    body.insert("ingestedAt".to_owned(), json!(event.ingested_at_ms));
    Value::Object(body)
}

fn alert_json(alert: &AlertPayload) -> Value {
    json!({
        "buildingId": alert.building_id,
        "roomId": alert.room_id,
        alert.metric.clone(): alert.value,
        "type": alert.metric,
        "direction": match alert.direction {
            BoundDirection::Above => "high",
            BoundDirection::Below => "low",
        },
        "threshold": alert.threshold,
        "timestamp": alert.ts_ms,
    })
}

#[async_trait]
impl Fanout for RedisFanout {
    async fn publish_telemetry(&self, event: &TelemetryEvent) {
        self.publish(RAW_CHANNEL, &telemetry_json(event)).await;
    }
}

#[async_trait]
impl Alerts for RedisFanout {
    async fn publish_breach(&self, channel: &str, alert: &AlertPayload) {
        self.publish(channel, &alert_json(alert)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(metric: &str, value: f64, payload: Value) -> TelemetryEvent {
        TelemetryEvent {
            metric: metric.to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            ts_ms: 1_699_999_000_000,
            value,
            payload: payload.as_object().cloned().unwrap_or_default(),
            ingested_at_ms: 1_700_000_000_000,
        }
    }

    #[test]
    fn a_temperature_event_keeps_the_node_wire_shape() {
        let body = telemetry_json(&event(
            "temperature",
            21.5,
            json!({ "buildingId": "b1", "roomId": "r1", "timestamp": 1, "temperature": 21.5 }),
        ));
        assert_eq!(body["type"], "temperature");
        assert_eq!(body["buildingId"], "b1");
        assert_eq!(body["roomId"], "r1");
        assert_eq!(body["timestamp"], 1_699_999_000_000i64);
        assert_eq!(body["value"], 21.5);
        assert_eq!(body["ingestedAt"], 1_700_000_000_000i64);
    }

    #[test]
    fn the_envelope_is_never_duplicated_into_the_extras() {
        let body = telemetry_json(&event(
            "temperature",
            21.5,
            json!({ "buildingId": "other", "roomId": "other", "timestamp": 999, "temperature": 21.5 }),
        ));
        assert_eq!(body["buildingId"], "b1");
        assert_eq!(body["roomId"], "r1");
        assert_eq!(body["timestamp"], 1_699_999_000_000i64);
    }

    #[test]
    fn an_air_quality_event_carries_the_full_snapshot() {
        let body = telemetry_json(&event(
            "airQuality",
            61.0,
            json!({
                "buildingId": "b1", "roomId": "r1", "timestamp": 1,
                "indoor_aqi": 61.0, "pm25": 12.0, "pm10": 20.0, "co2": 800.0,
                "voc": 0.3, "humidity": 41.0, "aqi": 55.0
            }),
        ));
        assert_eq!(body["value"], 61.0);
        for field in [
            "indoor_aqi",
            "pm25",
            "pm10",
            "co2",
            "voc",
            "humidity",
            "aqi",
        ] {
            assert!(body.get(field).is_some(), "missing {field}");
        }
    }

    #[test]
    fn a_high_breach_keeps_the_node_alert_shape() {
        let body = alert_json(&AlertPayload {
            metric: "temperature".to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            value: 26.0,
            direction: BoundDirection::Above,
            threshold: 25.0,
            ts_ms: 1_700_000_000_000,
        });
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
        let body = alert_json(&AlertPayload {
            metric: "temperature".to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            value: 14.0,
            direction: BoundDirection::Below,
            threshold: 18.0,
            ts_ms: 1,
        });
        assert_eq!(body["direction"], "low");
    }

    #[test]
    fn another_metric_names_its_value_field_after_itself() {
        let body = alert_json(&AlertPayload {
            metric: "peopleCount".to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            value: 20.0,
            direction: BoundDirection::Above,
            threshold: 12.0,
            ts_ms: 1,
        });
        assert_eq!(body["peopleCount"], 20.0);
        assert_eq!(body["type"], "peopleCount");
    }
}
