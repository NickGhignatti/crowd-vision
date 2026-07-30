//! What the use cases need from the outside world, stated as traits the core
//! owns. `infra` implements these; nothing here names a database or a protocol.
//!
//! Errors come back as `anyhow::Error` so a port never has to describe how its
//! adapter failed -- `DomainError` absorbs it at the use-case boundary.

use std::collections::HashMap;
use std::time::Duration;

use async_trait::async_trait;

use crate::domain::{AcceptedUpload, Building, UploadStatus};

/// BuildingStore defines the capability for persisting and retrieving `Building` data
#[async_trait]
pub trait BuildingStore: Send + Sync {
    async fn find_by_id(&self, id: &str) -> anyhow::Result<Option<Building>>;
    async fn find_by_domain(&self, domain: &str) -> anyhow::Result<Vec<Building>>;
    async fn find_by_name(&self, name: &str) -> anyhow::Result<Vec<Building>>;

    /// Write a building whether or not it is already there. Provisioning
    /// retries land here, so this has to converge rather than collide.
    async fn upsert(&self, building: &Building) -> anyhow::Result<()>;

    async fn counts_by_domain(&self, domains: &[String]) -> anyhow::Result<HashMap<String, i64>>;
}

/// UploadQueue defines the capability for enqueueing and claiming `AcceptedUpload` tasks
#[async_trait]
pub trait UploadQueue: Send + Sync {
    async fn enqueue(&self, upload: &AcceptedUpload) -> anyhow::Result<()>;

    /// Hand back one upload nobody else is working on, holding it for `lease`.
    /// If the holder dies, the upload becomes claimable again when it expires.
    async fn claim(&self, lease: Duration) -> anyhow::Result<Option<AcceptedUpload>>;

    async fn mark_ready(&self, id: &str) -> anyhow::Result<()>;
    async fn mark_failed(&self, id: &str, error: &str) -> anyhow::Result<()>;
    async fn status(&self, id: &str) -> anyhow::Result<Option<UploadStatus>>;
}

/// RegistrationEvents defines the capability for announcing a newly-registered
/// building to whoever wants to build their own model of it.
#[async_trait]
pub trait RegistrationEvents: Send + Sync {
    /// Announce that `building` has just been durably written. Only ever
    /// called after the write it announces has already succeeded.
    async fn publish_requested(&self, building: &Building) -> anyhow::Result<()>;
}

/// DownstreamSync defines the capability for synchronizing the twin's state with downstream services
#[async_trait]
pub trait DownstreamSync: Send + Sync {
    /// Mirror the twin's structure to whoever keeps a copy. Failing here fails
    /// the operation that triggered it.
    async fn clone_thresholds(
        &self,
        building: &Building,
        max_temperature: Option<f64>,
        claims: &str,
    ) -> anyhow::Result<()>;

    /// Seed the twin's dashboard preferences.
    async fn init_preferences(&self, building_id: &str, claims: &str);

    /// Seed one room's occupancy thresholds. Best effort: a failure here must
    /// never undo a geometry save that already succeeded.
    async fn init_room_thresholds(
        &self,
        building_id: &str,
        room_id: &str,
        capacity: f64,
        claims: &str,
    );
}
