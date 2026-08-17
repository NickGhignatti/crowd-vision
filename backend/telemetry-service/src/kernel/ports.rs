use crate::contracts::building::RegisteredBuilding;
use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::query::Bucket;
use crate::contracts::reading::Reading;
use crate::contracts::sensor::{ActionEndpoint, Sensor};
use crate::contracts::threshold::{Bounds, TemperatureLimits};
use async_trait::async_trait;
use serde_json::{Map, Value};

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

    async fn building_bounds(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Option<Bounds>>;

    async fn upsert(
        &self,
        building_id: &str,
        room_id: Option<&str>,
        metric: &str,
        patch: &Bounds,
    ) -> anyhow::Result<Bounds>;

    async fn temperature_limits(
        &self,
        building_id: &str,
    ) -> anyhow::Result<Option<TemperatureLimits>>;
}

#[derive(Debug)]
pub enum RegisterError {
    AlreadyExists,
    Other(anyhow::Error),
}

#[derive(Debug)]
pub enum DispatchError {
    Status(u16),
    Unreachable(String),
}

#[async_trait]
pub trait SensorStore: Send + Sync {
    async fn register(&self, sensor: &Sensor) -> Result<(), RegisterError>;
    async fn by_building(&self, building_id: &str) -> anyhow::Result<Vec<Sensor>>;
    async fn by_room(&self, building_id: &str, room_id: &str) -> anyhow::Result<Vec<Sensor>>;
}

#[async_trait]
pub trait ActionDispatch: Send + Sync {
    async fn endpoint(
        &self,
        action_name: &str,
        sensor_id: &str,
    ) -> anyhow::Result<Option<ActionEndpoint>>;

    async fn dispatch(
        &self,
        endpoint: &ActionEndpoint,
        body: &Map<String, Value>,
    ) -> Result<(), DispatchError>;
}

#[async_trait]
pub trait BuildingStore: Send + Sync {
    async fn upsert(&self, building: &RegisteredBuilding) -> anyhow::Result<()>;
}

#[async_trait]
pub trait RegistrationEvents: Send + Sync {
    async fn publish_completed(
        &self,
        building_id: &str,
        outcome: Result<(), String>,
    ) -> anyhow::Result<()>;
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
