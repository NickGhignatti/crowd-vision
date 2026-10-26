use crate::kernel::ingest::{Ingest, MAX_BATCH_READINGS};
use crate::types::error::DomainError;
use serde_json::{Value, json};
use std::sync::Arc;
use twin_schema::EstimatedOccupancy;

const ESTIMATED_OCCUPANCY: &str = "estimatedOccupancy";

/// Stores digital-twin's room counts from one Wi-Fi tick as `estimatedOccupancy` readings.
pub struct Occupancy {
    pub ingest: Arc<Ingest>,
}

impl Occupancy {
    /// Returns how many rooms were stored; a tick with no covered room stores nothing.
    pub async fn accept(&self, occupancy: &EstimatedOccupancy) -> Result<usize, DomainError> {
        let readings: Vec<Value> = occupancy
            .rooms
            .iter()
            .map(|(room, count)| {
                json!({
                    "type": ESTIMATED_OCCUPANCY,
                    "roomId": room,
                    "timestamp": occupancy.tick,
                    ESTIMATED_OCCUPANCY: count,
                })
            })
            .collect();
        let mut stored = 0;
        for batch in readings.chunks(MAX_BATCH_READINGS) {
            stored += self.ingest.accept(&occupancy.building_id, batch).await?;
        }
        Ok(stored)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{
        FakeAlerts, FakeBuildings, FakeFanout, FakePlugin, FakeReadings, FakeThresholds, FixedClock,
    };
    use crate::kernel::ports::{
        Alerts, BuildingStore, Clock, Fanout, ReadingStore, ThresholdStore,
    };
    use crate::kernel::registry::PluginRegistry;
    use std::collections::BTreeMap;

    const FIXTURE: &str = include_str!("../../../../schemas/fixtures/estimated-occupancy.json");

    fn occupancy(readings: Arc<FakeReadings>) -> Occupancy {
        let registry = PluginRegistry::new(vec![Box::new(FakePlugin {
            key: ESTIMATED_OCCUPANCY,
        })])
        .unwrap();
        Occupancy {
            ingest: Arc::new(Ingest {
                registry: Arc::new(registry),
                readings: readings as Arc<dyn ReadingStore>,
                thresholds: Arc::new(FakeThresholds::default()) as Arc<dyn ThresholdStore>,
                fanout: Arc::new(FakeFanout::default()) as Arc<dyn Fanout>,
                alerts: Arc::new(FakeAlerts::default()) as Arc<dyn Alerts>,
                buildings: Arc::new(FakeBuildings::default()) as Arc<dyn BuildingStore>,
                clock: Arc::new(FixedClock::default()) as Arc<dyn Clock>,
            }),
        }
    }

    fn case(index: usize) -> EstimatedOccupancy {
        let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
        serde_json::from_value(fixture["cases"][index]["body"].clone()).unwrap()
    }

    fn stored(readings: &FakeReadings) -> Vec<(String, String, i64, f64)> {
        readings
            .inserted
            .lock()
            .unwrap()
            .iter()
            .map(|r| (r.metric.clone(), r.room_id.clone(), r.ts_ms, r.value))
            .collect()
    }

    #[tokio::test]
    async fn every_room_becomes_one_reading_at_the_ticks_time_zeros_included() {
        let readings = Arc::new(FakeReadings::default());

        let count = occupancy(readings.clone()).accept(&case(0)).await.unwrap();

        assert_eq!(count, 2);
        let at = 1_761_300_000_000;
        assert_eq!(
            stored(&readings),
            vec![
                (
                    ESTIMATED_OCCUPANCY.to_owned(),
                    "room-lobby".to_owned(),
                    at,
                    3.0
                ),
                (
                    ESTIMATED_OCCUPANCY.to_owned(),
                    "room-office".to_owned(),
                    at,
                    0.0
                ),
            ]
        );
    }

    #[tokio::test]
    async fn a_tick_with_no_covered_room_stores_nothing() {
        let readings = Arc::new(FakeReadings::default());

        assert_eq!(
            occupancy(readings.clone()).accept(&case(1)).await.unwrap(),
            0
        );
        assert!(stored(&readings).is_empty());
    }

    // One ingest batch holds at most 500 readings; a large building still lands whole.
    #[tokio::test]
    async fn a_building_over_one_batch_is_stored_in_several() {
        let readings = Arc::new(FakeReadings::default());
        let rooms: BTreeMap<String, u64> =
            (0..1_200).map(|i| (format!("room-{i:04}"), 1)).collect();
        let big = EstimatedOccupancy { rooms, ..case(0) };

        assert_eq!(
            occupancy(readings.clone()).accept(&big).await.unwrap(),
            1_200
        );
        assert_eq!(stored(&readings).len(), 1_200);
    }

    #[tokio::test]
    async fn a_store_that_refuses_is_an_error() {
        let readings = Arc::new(FakeReadings {
            refuse: true,
            ..Default::default()
        });

        assert!(occupancy(readings).accept(&case(0)).await.is_err());
    }
}
