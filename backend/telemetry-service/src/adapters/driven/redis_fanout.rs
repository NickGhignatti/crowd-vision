use crate::adapters::metrics;
use crate::contracts::event::TelemetryEvent;
use crate::contracts::plugin::ENVELOPE_FIELDS;
use crate::kernel::ports::Fanout;
use async_trait::async_trait;
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use serde_json::Value;
use telemetry_contracts::{RAW_CHANNEL, TelemetryEnvelope, TelemetryReading};

pub struct RedisFanout {
    connection: MultiplexedConnection,
}

impl RedisFanout {
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(url)?;
        let connection = client.get_multiplexed_async_connection().await?;
        Ok(Self { connection })
    }

    async fn publish(&self, channel: &str, payload: &Value) -> &'static str {
        // Cloned per publish, not locked: MultiplexedConnection shares one
        // socket and pipelines concurrent commands. A Mutex here would make
        // every ingest wait a full round trip for the one before it.
        let mut connection = self.connection.clone();
        let published: redis::RedisResult<()> =
            connection.publish(channel, payload.to_string()).await;
        match published {
            Ok(()) => "ok",
            Err(error) => {
                log::error!("failed to publish on {channel}: {error}");
                "error"
            }
        }
    }
}

fn telemetry_json(event: &TelemetryEvent) -> Value {
    let reading = TelemetryReading {
        metric: event.metric.clone(),
        building_id: event.building_id.clone(),
        room_id: event.room_id.clone(),
        ts_ms: event.ts_ms,
        value: event.value,
        ingested_at_ms: event.ingested_at_ms,
        fields: event
            .payload
            .iter()
            .filter(|(key, _)| !ENVELOPE_FIELDS.contains(&key.as_str()))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
    };
    serde_json::to_value(reading).expect("a reading always serialises")
}

fn telemetry_batch_json(events: &[TelemetryEvent]) -> Value {
    let envelope = TelemetryEnvelope {
        building_id: events
            .first()
            .map(|event| event.building_id.clone())
            .unwrap_or_default(),
        ingested_at_ms: events
            .first()
            .map(|event| event.ingested_at_ms)
            .unwrap_or(0),
        readings: events.iter().map(telemetry_json).collect(),
    };
    serde_json::to_value(envelope).expect("an envelope always serialises")
}

#[async_trait]
impl Fanout for RedisFanout {
    async fn publish_telemetry(&self, events: &[TelemetryEvent]) {
        if events.is_empty() {
            return;
        }
        let outcome = self
            .publish(RAW_CHANNEL, &telemetry_batch_json(events))
            .await;
        metrics::record_telemetry_published(outcome);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
    fn a_batch_is_one_envelope_carrying_every_reading_of_the_tick() {
        let body = telemetry_batch_json(&[
            event("temperature", 21.5, json!({ "temperature": 21.5 })),
            event("temperature", 19.0, json!({ "temperature": 19.0 })),
        ]);

        assert_eq!(body["buildingId"], "b1");
        assert_eq!(body["ingestedAt"], 1_700_000_000_000i64);
        assert_eq!(body["readings"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn every_reading_in_a_batch_keeps_the_single_event_wire_shape() {
        let body =
            telemetry_batch_json(&[event("temperature", 21.5, json!({ "temperature": 21.5 }))]);
        let reading = &body["readings"][0];

        assert_eq!(reading["type"], "temperature");
        assert_eq!(reading["buildingId"], "b1");
        assert_eq!(reading["roomId"], "r1");
        assert_eq!(reading["value"], 21.5);
    }

    #[test]
    fn the_envelope_carries_what_the_router_reads_and_nothing_that_shadows_a_reading() {
        let body = telemetry_batch_json(&[event("temperature", 21.5, json!({}))]);
        assert!(
            body.get("buildingId").is_some(),
            "the channel is keyed on it"
        );
        assert!(
            body.get("readings").is_some(),
            "contracts-service gates on it"
        );
        assert!(
            body.get("type").is_none(),
            "`type` names a metric and belongs only to a reading"
        );
        assert_eq!(body["readings"][0]["type"], "temperature");
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
}
