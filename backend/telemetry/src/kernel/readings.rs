use crate::kernel::ports::{Clock, ReadingStore};
use crate::kernel::registry::PluginRegistry;
use crate::types::error::DomainError;
use crate::types::query::{AggMode, Bucket, TimeRange};
use crate::types::reading::Reading;
use std::sync::Arc;

pub struct DashboardQuery<'a> {
    pub metric: &'a str,
    pub building_id: &'a str,
    pub room_id: Option<&'a str>,
    pub range: Option<&'a str>,
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    pub agg: Option<&'a str>,
}

pub struct Readings {
    pub registry: Arc<PluginRegistry>,
    pub store: Arc<dyn ReadingStore>,
    pub clock: Arc<dyn Clock>,
}

impl Readings {
    fn known(&self, metric: &str) -> Result<(), DomainError> {
        self.registry
            .get(metric)
            .map(|_| ())
            .ok_or_else(|| DomainError::NotFound(format!("unknown sensor type: {metric}")))
    }

    pub async fn latest(
        &self,
        metric: &str,
        building_id: &str,
        room_id: &str,
    ) -> Result<Reading, DomainError> {
        self.known(metric)?;
        self.store
            .latest(building_id, metric, room_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound(format!(
                    "no {metric} data found for {building_id} {room_id}"
                ))
            })
    }

    pub async fn entire_building(
        &self,
        metric: &str,
        building_id: &str,
    ) -> Result<Vec<Reading>, DomainError> {
        self.known(metric)?;
        Ok(self.store.latest_per_room(building_id, metric).await?)
    }

    pub async fn dashboard(&self, query: DashboardQuery<'_>) -> Result<Vec<Bucket>, DomainError> {
        self.known(query.metric)?;
        let now_ms = self.clock.now_ms();
        let range = TimeRange::parse(query.range, query.start_ms, query.end_ms, now_ms)
            .map_err(DomainError::Validation)?;
        let agg = AggMode::parse(query.agg);
        Ok(self
            .store
            .series(
                query.building_id,
                query.metric,
                query.room_id,
                range.window(now_ms),
                range.bucket_interval(),
                agg.sql(),
            )
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakePlugin, FakeReadings, FixedClock, reading};

    const NOW: i64 = 1_700_000_000_000;
    const DAY_MS: i64 = 86_400_000;

    struct Harness {
        store: Arc<FakeReadings>,
        readings: Readings,
    }

    fn harness(store: FakeReadings) -> Harness {
        let store = Arc::new(store);
        let registry =
            Arc::new(PluginRegistry::new(vec![Box::new(FakePlugin::default())]).unwrap());
        let readings = Readings {
            registry,
            store: store.clone() as Arc<dyn ReadingStore>,
            clock: Arc::new(FixedClock::default()) as Arc<dyn Clock>,
        };
        Harness { store, readings }
    }

    fn query(metric: &'static str) -> DashboardQuery<'static> {
        DashboardQuery {
            metric,
            building_id: "b1",
            room_id: None,
            range: None,
            start_ms: None,
            end_ms: None,
            agg: None,
        }
    }

    #[tokio::test]
    async fn latest_for_a_room_with_no_data_is_not_found() {
        let h = harness(FakeReadings::default());
        let error = h.readings.latest("fake", "b1", "r1").await.unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
    }

    #[tokio::test]
    async fn latest_returns_the_newest_row_for_the_room() {
        let h = harness(FakeReadings {
            rows: vec![
                reading("fake", "b1", "r1", 10, 1.0),
                reading("fake", "b1", "r1", 20, 2.0),
                reading("fake", "b1", "r2", 30, 3.0),
            ],
            ..Default::default()
        });
        let latest = h.readings.latest("fake", "b1", "r1").await.unwrap();
        assert_eq!(latest.ts_ms, 20);
        assert_eq!(latest.value, 2.0);
    }

    #[tokio::test]
    async fn entire_building_returns_one_row_per_room_newest_first() {
        let h = harness(FakeReadings {
            rows: vec![
                reading("fake", "b1", "r1", 10, 1.0),
                reading("fake", "b1", "r1", 40, 4.0),
                reading("fake", "b1", "r2", 20, 2.0),
                reading("fake", "b2", "r3", 50, 5.0),
            ],
            ..Default::default()
        });
        let rows = h.readings.entire_building("fake", "b1").await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].room_id, "r1");
        assert_eq!(rows[0].ts_ms, 40);
        assert_eq!(rows[1].room_id, "r2");
    }

    #[tokio::test]
    async fn dashboard_data_is_bucketed_and_ordered_ascending() {
        let h = harness(FakeReadings {
            series: vec![
                Bucket {
                    ts_ms: NOW - DAY_MS,
                    value: 1.0,
                },
                Bucket {
                    ts_ms: NOW,
                    value: 2.0,
                },
            ],
            ..Default::default()
        });
        let buckets = h.readings.dashboard(query("fake")).await.unwrap();
        assert_eq!(buckets.len(), 2);
        assert!(buckets[0].ts_ms < buckets[1].ts_ms);

        let calls = h.store.series_calls.lock().unwrap();
        assert_eq!(calls[0].bucket, "1 hour");
        assert_eq!(calls[0].agg, "avg");
        assert_eq!(calls[0].window, (NOW - DAY_MS, NOW));
    }

    #[tokio::test]
    async fn a_room_filter_narrows_the_dashboard_query() {
        let h = harness(FakeReadings::default());
        let mut query = query("fake");
        query.room_id = Some("r1");
        h.readings.dashboard(query).await.unwrap();
        let calls = h.store.series_calls.lock().unwrap();
        assert_eq!(calls[0].room_id.as_deref(), Some("r1"));
    }

    #[tokio::test]
    async fn a_custom_range_without_a_start_is_a_validation_error() {
        let h = harness(FakeReadings::default());
        let mut query = query("fake");
        query.range = Some("custom");
        let error = h.readings.dashboard(query).await.unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.store.series_calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_unknown_sensor_type_is_not_found() {
        let h = harness(FakeReadings::default());
        assert!(matches!(
            h.readings.latest("humidity", "b1", "r1").await.unwrap_err(),
            DomainError::NotFound(_)
        ));
        assert!(matches!(
            h.readings
                .entire_building("humidity", "b1")
                .await
                .unwrap_err(),
            DomainError::NotFound(_)
        ));
        assert!(matches!(
            h.readings.dashboard(query("humidity")).await.unwrap_err(),
            DomainError::NotFound(_)
        ));
        assert!(h.store.series_calls.lock().unwrap().is_empty());
    }
}
