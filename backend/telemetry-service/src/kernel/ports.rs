use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::reading::Reading;
use crate::contracts::threshold::Bounds;
use async_trait::async_trait;

#[async_trait]
pub trait ReadingStore: Send + Sync {
    async fn insert(&self, reading: &Reading) -> anyhow::Result<()>;
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
