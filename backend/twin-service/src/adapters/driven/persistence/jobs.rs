use std::time::Duration;

use async_trait::async_trait;
use mongodb::Collection;
use mongodb::bson::{DateTime, doc};
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
        Self {
            col: buildings
                .client()
                .database(&buildings.namespace().db)
                .collection("pending_uploads"),
        }
    }

    async fn resolve(
        &self,
        id: &str,
        set: mongodb::bson::Document,
    ) -> anyhow::Result<Option<Duration>> {
        let filter = doc! { "id": { "$eq": id }, "status": "pending" };
        let update = doc! { "$set": set };

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

        // Looks for a single document to claim, assigning it to the current lease.
        let filter = doc! {
            "status": "pending",
            "$or": [
                { "leased_until": null },
                { "leased_until": { "$lte": now } },
            ],
        };
        let update = doc! {
            "$set": { "leased_until": expires_at },
            "$inc": { "attempts": 1 },
        };

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Coordinates, Dimensions, Room};
    use mongodb::Client;
    use mongodb::options::ClientOptions;
    use uuid::Uuid;

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

    async fn test_queue() -> MongoUploadQueue {
        let uri =
            std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let opts = ClientOptions::parse(&uri).await.unwrap();
        let client = Client::with_options(opts).unwrap();
        MongoUploadQueue {
            col: client
                .database("twin_service_test")
                .collection(&format!("pending_uploads_{}", Uuid::new_v4())),
        }
    }

    async fn enqueued(queue: &MongoUploadQueue) -> String {
        let id = Uuid::new_v4().to_string();
        let upload = AcceptedUpload {
            id: id.clone(),
            building: dummy_building(&id),
            claims: "tok".to_string(),
        };
        queue.enqueue(&upload).await.unwrap();
        id
    }

    const LEASE: Duration = Duration::from_secs(30);

    #[tokio::test]
    async fn an_enqueued_upload_is_pending() {
        let queue = test_queue().await;
        let id = enqueued(&queue).await;

        assert_eq!(
            queue.status(&id).await.unwrap(),
            Some(UploadStatus::Pending)
        );
    }

    #[tokio::test]
    async fn claiming_returns_the_enqueued_upload_with_its_payload() {
        let queue = test_queue().await;
        let id = enqueued(&queue).await;

        let claimed = queue
            .claim(LEASE)
            .await
            .unwrap()
            .expect("a claimable upload");
        assert_eq!(claimed.id, id);
        assert_eq!(claimed.building.id, id);
        assert_eq!(claimed.claims, "tok");
    }

    #[tokio::test]
    async fn a_leased_upload_is_not_handed_to_a_second_worker() {
        let queue = test_queue().await;
        enqueued(&queue).await;

        queue.claim(LEASE).await.unwrap().expect("first worker");
        let second = queue.claim(LEASE).await.unwrap();

        assert!(
            second.is_none(),
            "a held upload must not be delivered twice"
        );
    }

    #[tokio::test]
    async fn an_upload_whose_lease_expired_is_redelivered() {
        let queue = test_queue().await;
        let id = enqueued(&queue).await;

        queue
            .claim(Duration::ZERO)
            .await
            .unwrap()
            .expect("first worker");
        tokio::time::sleep(Duration::from_millis(20)).await;

        let redelivered = queue.claim(LEASE).await.unwrap().expect("redelivery");
        assert_eq!(redelivered.id, id);
    }

    #[tokio::test]
    async fn every_delivery_is_counted() {
        let queue = test_queue().await;
        let id = enqueued(&queue).await;

        queue.claim(Duration::ZERO).await.unwrap().unwrap();
        queue.claim(Duration::ZERO).await.unwrap().unwrap();

        let doc = queue
            .col
            .find_one(doc! { "id": { "$eq": &id } })
            .await
            .unwrap()
            .unwrap();
        assert_eq!(doc.attempts, 2, "the retry budget depends on this count");
    }

    #[tokio::test]
    async fn a_provisioned_upload_is_ready_and_no_longer_claimable() {
        let queue = test_queue().await;
        let id = enqueued(&queue).await;
        queue.claim(LEASE).await.unwrap().expect("claimable");

        queue.mark_ready(&id).await.unwrap();

        assert_eq!(queue.status(&id).await.unwrap(), Some(UploadStatus::Ready));
        assert!(queue.claim(Duration::ZERO).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn a_dead_lettered_upload_is_failed_and_no_longer_claimable() {
        let queue = test_queue().await;
        let id = enqueued(&queue).await;

        queue.mark_failed(&id, "downstream refused").await.unwrap();

        assert_eq!(queue.status(&id).await.unwrap(), Some(UploadStatus::Failed));
        assert!(queue.claim(Duration::ZERO).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn an_empty_queue_yields_nothing() {
        let queue = test_queue().await;

        assert!(queue.claim(LEASE).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn an_unknown_handle_has_no_status() {
        let queue = test_queue().await;

        assert_eq!(queue.status("nope").await.unwrap(), None);
    }
}
