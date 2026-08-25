use crate::kernel::ports::{Alerts, Clock, Fanout, ReadingStore, ThresholdStore};
use crate::kernel::registry::PluginRegistry;
use crate::types::error::DomainError;
use crate::types::event::{AlertPayload, TelemetryEvent};
use crate::types::reading::Reading;
use crate::types::threshold::{Bounds, breach};
use serde_json::{Map, Value};
use std::sync::Arc;

/// Ingests telemetry readings from plugins guiding the ingestion process.
pub struct Ingest {
    pub registry: Arc<PluginRegistry>,
    pub readings: Arc<dyn ReadingStore>,
    pub thresholds: Arc<dyn ThresholdStore>,
    pub fanout: Arc<dyn Fanout>,
    pub alerts: Arc<dyn Alerts>,
    pub clock: Arc<dyn Clock>,
}

pub const MAX_BATCH_READINGS: usize = 500;

impl Ingest {
    pub async fn accept(&self, building_id: &str, items: &[Value]) -> Result<usize, DomainError> {
        if items.len() > MAX_BATCH_READINGS {
            return Err(DomainError::Validation(format!(
                "readings: must not exceed {MAX_BATCH_READINGS} per batch."
            )));
        }

        let mut errors = Vec::new();
        if building_id.trim().is_empty() {
            errors.push("buildingId: must be a non-empty string.".to_owned());
        }
        if items.is_empty() {
            errors.push("readings: must not be empty.".to_owned());
        }

        let mut readings = Vec::with_capacity(items.len());
        for (index, item) in items.iter().enumerate() {
            match self.reading_from(building_id, item) {
                Ok(reading) => readings.push(reading),
                Err(message) => errors.push(format!("readings[{index}]: {message}")),
            }
        }
        if !errors.is_empty() {
            return Err(DomainError::Validation(errors.join(" ")));
        }

        let keys: Vec<(&str, &str)> = readings
            .iter()
            .map(|reading| (reading.metric.as_str(), reading.room_id.as_str()))
            .collect();
        let (inserted, resolved) = tokio::join!(
            self.readings.insert(&readings),
            self.thresholds.resolve(building_id, &keys),
        );
        inserted?;

        let resolved = resolved.unwrap_or_else(|error| {
            log::error!("threshold evaluation failed: {error}");
            Vec::new()
        });
        for (reading, bounds) in readings.iter().zip(resolved) {
            self.raise_breach(reading, bounds).await;
        }

        let now_ms = self.clock.now_ms();
        let events: Vec<TelemetryEvent> = readings
            .iter()
            .map(|reading| TelemetryEvent::from_reading(reading, now_ms))
            .collect();
        self.fanout.publish_telemetry(&events).await;

        Ok(events.len())
    }

    fn reading_from(&self, building_id: &str, item: &Value) -> Result<Reading, String> {
        let Some(object) = item.as_object() else {
            return Err("must be an object.".to_owned());
        };

        let metric = object
            .get("type")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|metric| !metric.is_empty())
            .ok_or_else(|| "type: must be a non-empty string.".to_owned())?;

        let plugin = self
            .registry
            .get(metric)
            .ok_or_else(|| format!("type: unknown sensor type: {metric}."))?;

        let mut payload: Map<String, Value> = object.clone();
        payload.remove("type");
        if !building_id.trim().is_empty() {
            if let Some(own) = object.get("buildingId").and_then(Value::as_str)
                && own != building_id
            {
                return Err(format!(
                    "buildingId: must match the batch's building ({building_id})."
                ));
            }
            payload.insert("buildingId".to_owned(), Value::from(building_id));
        }

        plugin
            .validate(&Value::Object(payload))
            .map_err(|messages| messages.join(" "))
    }

    async fn raise_breach(&self, reading: &Reading, resolved: Option<Bounds>) {
        let Some(plugin) = self.registry.get(&reading.metric) else {
            return;
        };
        let Some(bounds) = resolved else {
            return;
        };
        if let Some(breach) = breach(plugin.bounds(), &bounds, reading.value) {
            let alert = AlertPayload {
                metric: reading.metric.clone(),
                building_id: reading.building_id.clone(),
                room_id: reading.room_id.clone(),
                value: reading.value,
                direction: breach.direction,
                threshold: breach.threshold,
                ts_ms: self.clock.now_ms(),
            };
            self.alerts.publish_breach(&alert).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakeAlerts, FakePlugin, FakeReadings, FakeThresholds, FixedClock};
    use serde_json::json;

    struct Harness {
        readings: Arc<FakeReadings>,
        fanout: Arc<crate::kernel::fakes::FakeFanout>,
        alerts: Arc<FakeAlerts>,
        ingest: Ingest,
    }

    fn harness(readings: FakeReadings, thresholds: FakeThresholds) -> Harness {
        let readings = Arc::new(readings);
        let fanout = Arc::new(crate::kernel::fakes::FakeFanout::default());
        let alerts = Arc::new(FakeAlerts::default());
        let registry =
            Arc::new(PluginRegistry::new(vec![Box::new(FakePlugin::default())]).unwrap());
        let ingest = Ingest {
            registry,
            readings: readings.clone() as Arc<dyn ReadingStore>,
            thresholds: Arc::new(thresholds) as Arc<dyn ThresholdStore>,
            fanout: fanout.clone() as Arc<dyn Fanout>,
            alerts: alerts.clone() as Arc<dyn Alerts>,
            clock: Arc::new(FixedClock::default()) as Arc<dyn Clock>,
        };
        Harness {
            readings,
            fanout,
            alerts,
            ingest,
        }
    }

    fn plain() -> Harness {
        harness(FakeReadings::default(), FakeThresholds::default())
    }

    fn bounds(value: Value) -> FakeThresholds {
        FakeThresholds::with(vec![crate::kernel::fakes::row("b1", None, "fake", value)])
    }

    fn item(room: &str, value: f64) -> Value {
        json!({ "type": "fake", "roomId": room, "timestamp": 1_699_999_000_000i64, "fake": value })
    }

    #[tokio::test]
    async fn a_whole_tick_is_persisted_and_published_as_one_message() {
        let h = plain();
        let items = vec![item("r1", 1.0), item("r2", 2.0), item("r3", 3.0)];

        let accepted = h.ingest.accept("b1", &items).await.unwrap();

        assert_eq!(accepted, 3);
        assert_eq!(h.readings.inserted.lock().unwrap().len(), 3);
        let batches = h.fanout.batches.lock().unwrap();
        assert_eq!(batches.len(), 1, "one tick must be one message");
        assert_eq!(batches[0].len(), 3);
    }

    #[tokio::test]
    async fn the_batch_building_is_stamped_onto_every_reading() {
        let h = plain();
        h.ingest
            .accept("b1", &[item("r1", 1.0), item("r2", 2.0)])
            .await
            .unwrap();

        let inserted = h.readings.inserted.lock().unwrap();
        assert!(inserted.iter().all(|reading| reading.building_id == "b1"));
    }

    #[tokio::test]
    async fn a_reading_naming_another_building_is_rejected() {
        let h = plain();
        let mut smuggled = item("r1", 1.0);
        smuggled["buildingId"] = json!("someone-elses-building");

        let error = h.ingest.accept("b1", &[smuggled]).await.unwrap_err();

        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.readings.inserted.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn one_bad_reading_rejects_the_whole_batch() {
        let h = plain();
        let items = vec![item("r1", 1.0), json!({ "type": "fake", "roomId": "r2" })];

        let error = h.ingest.accept("b1", &items).await.unwrap_err();

        let DomainError::Validation(message) = error else {
            panic!("a malformed reading is a validation error");
        };
        assert!(message.contains("readings[1]"), "got {message}");
        assert!(
            h.readings.inserted.lock().unwrap().is_empty(),
            "all-or-nothing: nothing persists when one reading fails"
        );
        assert!(h.fanout.batches.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_unknown_sensor_type_names_the_reading_that_carried_it() {
        let h = plain();
        let items = vec![
            item("r1", 1.0),
            json!({ "type": "humidity", "roomId": "r2" }),
        ];

        let error = h.ingest.accept("b1", &items).await.unwrap_err();

        let DomainError::Validation(message) = error else {
            panic!("an unknown type inside a batch is a validation error, not a 404");
        };
        assert!(message.contains("readings[1]"), "got {message}");
        assert!(message.contains("humidity"), "got {message}");
    }

    #[tokio::test]
    async fn an_empty_batch_is_rejected() {
        let h = plain();
        assert!(h.ingest.accept("b1", &[]).await.is_err());
    }

    #[tokio::test]
    async fn a_batch_without_a_building_is_rejected() {
        let h = plain();
        let error = h.ingest.accept("  ", &[item("r1", 1.0)]).await;
        assert!(error.is_err());
    }

    #[tokio::test]
    async fn a_batch_larger_than_the_cap_is_rejected_before_any_work() {
        let h = plain();
        let items: Vec<Value> = (0..MAX_BATCH_READINGS + 1)
            .map(|i| item(&format!("r{i}"), 1.0))
            .collect();

        assert!(h.ingest.accept("b1", &items).await.is_err());
        assert!(h.readings.inserted.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn every_breach_in_a_tick_raises_its_own_alert() {
        let h = harness(FakeReadings::default(), bounds(json!({ "maxFake": 10.0 })));

        h.ingest
            .accept("b1", &[item("r1", 50.0), item("r2", 1.0), item("r3", 99.0)])
            .await
            .unwrap();

        let alerts = h.alerts.published.lock().unwrap();
        assert_eq!(alerts.len(), 2, "only the two readings over the bound");
    }

    #[tokio::test]
    async fn nothing_is_published_when_the_bulk_write_fails() {
        let h = harness(
            FakeReadings {
                refuse: true,
                ..Default::default()
            },
            FakeThresholds::default(),
        );

        assert!(h.ingest.accept("b1", &[item("r1", 1.0)]).await.is_err());
        assert!(
            h.fanout.batches.lock().unwrap().is_empty(),
            "publish only after the batch is durably written"
        );
    }

    #[tokio::test]
    async fn a_valid_reading_is_persisted_and_published() {
        let h = plain();
        h.ingest.accept("b1", &[item("r1", 21.5)]).await.unwrap();
        assert_eq!(h.readings.inserted.lock().unwrap().len(), 1);
        let published = h.fanout.published.lock().unwrap();
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].value, 21.5);
        assert_eq!(published[0].ingested_at_ms, 1_700_000_000_000);
    }

    #[tokio::test]
    async fn a_reading_within_bounds_publishes_no_alert() {
        let h = harness(
            FakeReadings::default(),
            bounds(json!({ "maxFake": 25.0, "minFake": 18.0 })),
        );
        h.ingest.accept("b1", &[item("r1", 21.5)]).await.unwrap();
        assert!(h.alerts.published.lock().unwrap().is_empty());
        assert_eq!(h.fanout.published.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_breach_publishes_an_alert_carrying_the_metric_and_the_bound() {
        let h = harness(FakeReadings::default(), bounds(json!({ "maxFake": 25.0 })));
        h.ingest.accept("b1", &[item("r1", 26.0)]).await.unwrap();
        let published = h.alerts.published.lock().unwrap();
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].metric, "fake");
        assert_eq!(published[0].building_id, "b1");
        assert_eq!(published[0].room_id, "r1");
        assert_eq!(published[0].threshold, 25.0);
        assert_eq!(published[0].value, 26.0);
    }

    #[tokio::test]
    async fn a_breach_still_publishes_telemetry() {
        let h = harness(FakeReadings::default(), bounds(json!({ "maxFake": 25.0 })));
        h.ingest.accept("b1", &[item("r1", 26.0)]).await.unwrap();
        assert_eq!(h.fanout.published.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn threshold_evaluation_failure_is_swallowed_and_the_reading_still_lands() {
        let h = harness(
            FakeReadings::default(),
            FakeThresholds {
                refuse: true,
                ..Default::default()
            },
        );
        h.ingest.accept("b1", &[item("r1", 21.5)]).await.unwrap();
        assert_eq!(h.readings.inserted.lock().unwrap().len(), 1);
        assert_eq!(h.fanout.published.lock().unwrap().len(), 1);
        assert!(h.alerts.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn no_thresholds_configured_means_no_alert() {
        let h = plain();
        h.ingest.accept("b1", &[item("r1", 9_000.0)]).await.unwrap();
        assert!(h.alerts.published.lock().unwrap().is_empty());
    }
}
