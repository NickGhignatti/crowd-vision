use crate::contracts::error::DomainError;
use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::threshold::breach;
use crate::kernel::ports::{Alerts, Clock, Fanout, ReadingStore, ThresholdStore};
use crate::kernel::registry::PluginRegistry;
use serde_json::Value;
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

impl Ingest {
    pub async fn accept(&self, metric: &str, payload: &Value) -> Result<(), DomainError> {
        let plugin = self
            .registry
            .get(metric)
            .ok_or_else(|| DomainError::NotFound(format!("unknown sensor type: {metric}")))?;

        let reading = plugin
            .validate(payload)
            .map_err(|errors| DomainError::Validation(errors.join(" ")))?;

        // Independent of each other, so they overlap: persisting a reading
        // does not inform which thresholds apply to it.
        let (inserted, resolved) = tokio::join!(
            self.readings.insert(&reading),
            self.thresholds
                .resolve(&reading.building_id, &reading.metric, &reading.room_id)
        );
        inserted?;

        match resolved {
            Ok(Some(bounds)) => {
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
            Ok(None) => {}
            Err(error) => log::error!("threshold evaluation failed: {error}"),
        }

        self.fanout
            .publish_telemetry(&TelemetryEvent::from_reading(&reading, self.clock.now_ms()))
            .await;

        Ok(())
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

    fn payload(value: f64) -> Value {
        json!({
            "buildingId": "b1",
            "roomId": "r1",
            "timestamp": 1_699_999_000_000i64,
            "fake": value
        })
    }

    #[tokio::test]
    async fn an_unknown_sensor_type_is_rejected_before_any_persistence() {
        let h = plain();
        let error = h
            .ingest
            .accept("humidity", &payload(1.0))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
        assert!(h.readings.inserted.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_invalid_payload_is_rejected_and_nothing_is_persisted() {
        let h = plain();
        let error = h
            .ingest
            .accept("fake", &json!({ "buildingId": "b1", "roomId": "r1" }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.readings.inserted.lock().unwrap().is_empty());
        assert!(h.fanout.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_valid_reading_is_persisted_and_published() {
        let h = plain();
        h.ingest.accept("fake", &payload(21.5)).await.unwrap();
        assert_eq!(h.readings.inserted.lock().unwrap().len(), 1);
        let published = h.fanout.published.lock().unwrap();
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].value, 21.5);
        assert_eq!(published[0].ingested_at_ms, 1_700_000_000_000);
    }

    #[tokio::test]
    async fn a_failed_persist_does_not_publish_telemetry() {
        let h = harness(
            FakeReadings {
                refuse: true,
                ..Default::default()
            },
            FakeThresholds::default(),
        );
        assert!(h.ingest.accept("fake", &payload(21.5)).await.is_err());
        assert!(h.fanout.published.lock().unwrap().is_empty());
        assert!(h.alerts.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_reading_within_bounds_publishes_no_alert() {
        let h = harness(
            FakeReadings::default(),
            bounds(json!({ "maxFake": 25.0, "minFake": 18.0 })),
        );
        h.ingest.accept("fake", &payload(21.5)).await.unwrap();
        assert!(h.alerts.published.lock().unwrap().is_empty());
        assert_eq!(h.fanout.published.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_breach_publishes_an_alert_carrying_the_metric_and_the_bound() {
        let h = harness(FakeReadings::default(), bounds(json!({ "maxFake": 25.0 })));
        h.ingest.accept("fake", &payload(26.0)).await.unwrap();
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
        h.ingest.accept("fake", &payload(26.0)).await.unwrap();
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
        h.ingest.accept("fake", &payload(21.5)).await.unwrap();
        assert_eq!(h.readings.inserted.lock().unwrap().len(), 1);
        assert_eq!(h.fanout.published.lock().unwrap().len(), 1);
        assert!(h.alerts.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn no_thresholds_configured_means_no_alert() {
        let h = plain();
        h.ingest.accept("fake", &payload(9_000.0)).await.unwrap();
        assert!(h.alerts.published.lock().unwrap().is_empty());
    }
}
