use std::time::Duration;

use async_trait::async_trait;
use mongodb::Collection;
use mongodb::bson::{DateTime, Document, doc};
use mongodb::options::ReturnDocument;
use serde::{Deserialize, Serialize};

use crate::domain::{AcceptedUpload, Building, UploadStatus};
use crate::service::ports::UploadQueue;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum JobStatus {
    Pending,
    Ready,
    Failed,
}

impl From<JobStatus> for UploadStatus {
    fn from(s: JobStatus) -> Self {
        match s {
            JobStatus::Pending => UploadStatus::Pending,
            JobStatus::Ready => UploadStatus::Ready,
            JobStatus::Failed => UploadStatus::Failed,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingUpload {
    id: String,
    building: Building,
    claims: String,
    status: JobStatus,
    attempts: i32,
    leased_until: Option<DateTime>,
    error: Option<String>,
    accepted_at: DateTime,
}

impl PendingUpload {
    fn accepted(upload: &AcceptedUpload) -> Self {
        Self {
            id: upload.id.clone(),
            building: upload.building.clone(),
            claims: upload.claims.clone(),
            status: JobStatus::Pending,
            attempts: 0,
            leased_until: None,
            error: None,
            accepted_at: DateTime::now(),
        }
    }
}

impl From<PendingUpload> for AcceptedUpload {
    fn from(job: PendingUpload) -> Self {
        Self {
            id: job.id,
            building: job.building,
            claims: job.claims,
        }
    }
}

pub struct MongoUploadQueue {
    col: Collection<PendingUpload>,
}

impl MongoUploadQueue {
    pub fn from_building_collection(buildings: &Collection<Building>) -> Self {
        Self::with_collection_name(buildings, "pending_uploads")
    }

    pub fn with_collection_name(buildings: &Collection<Building>, name: &str) -> Self {
        Self {
            col: buildings
                .client()
                .database(&buildings.namespace().db)
                .collection(name),
        }
    }

    async fn resolve(&self, id: &str, set: Document) -> anyhow::Result<Option<Duration>> {
        let filter = resolve_filter(id);
        let update = resolve_update(set);

        Ok(self
            .col
            .find_one_and_update(filter, update)
            .return_document(ReturnDocument::Before)
            .await?
            .map(|job| {
                let elapsed_ms =
                    DateTime::now().timestamp_millis() - job.accepted_at.timestamp_millis();
                Duration::from_millis(elapsed_ms.max(0) as u64)
            }))
    }
}

#[async_trait]
impl UploadQueue for MongoUploadQueue {
    async fn enqueue(&self, upload: &AcceptedUpload) -> anyhow::Result<()> {
        self.col.insert_one(PendingUpload::accepted(upload)).await?;
        Ok(())
    }

    async fn claim(&self, lease: Duration) -> anyhow::Result<Option<AcceptedUpload>> {
        let now = DateTime::now();
        let expires_at = DateTime::from_millis(now.timestamp_millis() + lease.as_millis() as i64);
        let filter = claimable_filter(now);
        let update = claim_update(expires_at);

        Ok(self
            .col
            .find_one_and_update(filter, update)
            .return_document(ReturnDocument::After)
            .await?
            .map(AcceptedUpload::from))
    }

    async fn mark_ready(&self, id: &str) -> anyhow::Result<Option<Duration>> {
        self.resolve(id, doc! { "status": "ready", "leased_until": null })
            .await
    }

    async fn mark_failed(&self, id: &str, error: &str) -> anyhow::Result<Option<Duration>> {
        self.resolve(
            id,
            doc! { "status": "failed", "leased_until": null, "error": error },
        )
        .await
    }

    async fn status(&self, id: &str) -> anyhow::Result<Option<UploadStatus>> {
        Ok(self
            .col
            .find_one(doc! { "id": { "$eq": id } })
            .await?
            .map(|job| job.status.into()))
    }
}

fn claimable_filter(now: DateTime) -> Document {
    doc! {
        "status": "pending",
        "$or": [
            { "leased_until": null },
            { "leased_until": { "$lte": now } },
        ],
    }
}

fn claim_update(expires_at: DateTime) -> Document {
    doc! {
        "$set": { "leased_until": expires_at },
        "$inc": { "attempts": 1 },
    }
}

fn resolve_filter(id: &str) -> Document {
    doc! { "id": { "$eq": id }, "status": "pending" }
}

fn resolve_update(set: Document) -> Document {
    doc! { "$set": set }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Coordinates, Dimensions, Room};

    fn dummy_building(id: &str) -> Building {
        Building {
            id: id.to_string(),
            name: "Test Building".to_string(),
            rooms: vec![Room {
                id: "r1".to_string(),
                name: "r1".to_string(),
                capacity: 10.0,
                position: Coordinates {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                dimensions: Dimensions {
                    width: 1.0,
                    height: 1.0,
                    depth: 1.0,
                },
                color: None,
            }],
            domains: vec!["eng".to_string()],
        }
    }

    #[test]
    fn job_status_maps_onto_upload_status_one_to_one() {
        assert_eq!(
            UploadStatus::from(JobStatus::Pending),
            UploadStatus::Pending
        );
        assert_eq!(UploadStatus::from(JobStatus::Ready), UploadStatus::Ready);
        assert_eq!(UploadStatus::from(JobStatus::Failed), UploadStatus::Failed);
    }

    #[test]
    fn a_freshly_accepted_upload_starts_pending_with_no_attempts_or_lease() {
        let upload = AcceptedUpload {
            id: "u1".to_string(),
            building: dummy_building("b1"),
            claims: "tok".to_string(),
        };

        let job = PendingUpload::accepted(&upload);

        assert_eq!(job.id, "u1");
        assert_eq!(job.status, JobStatus::Pending);
        assert_eq!(job.attempts, 0);
        assert_eq!(job.leased_until, None);
        assert_eq!(job.error, None);
    }

    #[test]
    fn converting_a_job_back_to_an_accepted_upload_drops_queue_only_fields() {
        let upload = AcceptedUpload {
            id: "u1".to_string(),
            building: dummy_building("b1"),
            claims: "tok".to_string(),
        };
        let job = PendingUpload::accepted(&upload);

        let round_tripped = AcceptedUpload::from(job);

        assert_eq!(round_tripped.id, "u1");
        assert_eq!(round_tripped.claims, "tok");
        assert_eq!(round_tripped.building.id, "b1");
    }

    #[test]
    fn claimable_filter_only_matches_pending_jobs_with_no_or_expired_lease() {
        let now = DateTime::now();
        let filter = claimable_filter(now);

        assert_eq!(
            filter,
            doc! {
                "status": "pending",
                "$or": [
                    { "leased_until": null },
                    { "leased_until": { "$lte": now } },
                ],
            }
        );
    }

    #[test]
    fn claim_update_sets_the_lease_and_increments_attempts() {
        let expires_at = DateTime::now();
        let update = claim_update(expires_at);

        assert_eq!(
            update,
            doc! {
                "$set": { "leased_until": expires_at },
                "$inc": { "attempts": 1 },
            }
        );
    }

    #[test]
    fn resolve_filter_only_matches_the_given_id_while_still_pending() {
        assert_eq!(
            resolve_filter("u1"),
            doc! { "id": { "$eq": "u1" }, "status": "pending" }
        );
    }

    #[test]
    fn resolve_update_wraps_the_given_fields_in_a_set() {
        let set = doc! { "status": "ready" };
        assert_eq!(resolve_update(set.clone()), doc! { "$set": set });
    }
}
