use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;

use crate::domain::{AcceptedUpload, Building, UploadStatus};

#[async_trait]
pub trait BuildingStore: Send + Sync {
    async fn find_by_id(&self, id: &str) -> anyhow::Result<Option<Building>>;
    async fn find_by_domain(&self, domain: &str) -> anyhow::Result<Vec<Building>>;
    async fn find_by_name(&self, name: &str) -> anyhow::Result<Vec<Building>>;
    async fn upsert(&self, building: &Building) -> anyhow::Result<()>;
    async fn counts_by_domain(&self, domains: &[String]) -> anyhow::Result<HashMap<String, i64>>;
}

#[async_trait]
pub trait UploadQueue: Send + Sync {
    async fn enqueue(&self, upload: &AcceptedUpload) -> anyhow::Result<()>;
    async fn claim(&self, lease: Duration) -> anyhow::Result<Option<AcceptedUpload>>;
    async fn mark_ready(&self, id: &str) -> anyhow::Result<Option<Duration>>;
    async fn mark_failed(&self, id: &str, error: &str) -> anyhow::Result<Option<Duration>>;
    async fn status(&self, id: &str) -> anyhow::Result<Option<UploadStatus>>;
}

#[async_trait]
pub trait RegistrationEvents: Send + Sync {
    async fn publish_requested(&self, building: &Building) -> anyhow::Result<()>;
}

#[async_trait]
pub trait DownstreamSync: Send + Sync {
    async fn clone_thresholds(
        &self,
        building: &Building,
        max_temperature: Option<f64>,
        claims: &str,
    ) -> anyhow::Result<()>;

    async fn init_preferences(&self, building_id: &str, claims: &str);

    async fn init_room_thresholds(
        &self,
        building_id: &str,
        room_id: &str,
        capacity: f64,
        claims: &str,
    );
}
