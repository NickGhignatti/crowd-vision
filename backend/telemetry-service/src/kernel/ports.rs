use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::query::Bucket;
use crate::contracts::reading::Reading;
use crate::contracts::threshold::Bounds;
use async_trait::async_trait;

#[async_trait]
pub trait ReadingStore: Send + Sync {
    async fn insert(&self, reading: &Reading) -> anyhow::Result<()>;

    async fn latest(
        &self,
        building_id: &str,
        metric: &str,
        room_id: &str,
    ) -> anyhow::Result<Option<Reading>>;

    async fn latest_per_room(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Vec<Reading>>;

    async fn series(
        &self,
        building_id: &str,
        metric: &str,
        room_id: Option<&str>,
        window: (i64, i64),
        bucket: &str,
        agg: &str,
    ) -> anyhow::Result<Vec<Bucket>>;
}

#[async_trait]
pub trait ThresholdStore: Send + Sync {
    async fn resolve(
        &self,
        building_id: &str,
        metric: &str,
        room_id: &str,
    ) -> anyhow::Result<Option<Bounds>>;
}

#[async_trait]
pub trait Fanout: Send + Sync {
    async fn publish_telemetry(&self, event: &TelemetryEvent);
}

#[async_trait]
pub trait Alerts: Send + Sync {
    async fn publish_breach(&self, channel: &str, alert: &AlertPayload);
}

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> i64;
}
