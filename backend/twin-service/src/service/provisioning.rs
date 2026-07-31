use std::sync::Arc;
use std::time::Duration;

use crate::domain::{AcceptedUpload, Building, DomainError, UploadStatus};
use crate::service::ports::{BuildingStore, DownstreamSync, RegistrationEvents, UploadQueue};

pub struct Provisioning {
    buildings: Arc<dyn BuildingStore>,
    queue: Arc<dyn UploadQueue>,
    downstream: Arc<dyn DownstreamSync>,
    events: Arc<dyn RegistrationEvents>,
}

impl Provisioning {
    pub fn new(
        buildings: Arc<dyn BuildingStore>,
        queue: Arc<dyn UploadQueue>,
        downstream: Arc<dyn DownstreamSync>,
        events: Arc<dyn RegistrationEvents>,
    ) -> Self {
        Self {
            buildings,
            queue,
            downstream,
            events,
        }
    }

    pub async fn accept(&self, building: Building, claims: &str) -> Result<String, DomainError> {
        let upload = AcceptedUpload {
            id: building.id.clone(),
            building,
            claims: claims.to_string(),
        };
        self.queue.enqueue(&upload).await?;
        Ok(upload.id)
    }

    pub async fn status(&self, handle: &str) -> Result<UploadStatus, DomainError> {
        self.queue
            .status(handle)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("No upload with handle: \"{handle}\"")))
    }

    pub async fn provision_next(&self, lease: Duration) -> Result<bool, DomainError> {
        let Some(upload) = self.queue.claim(lease).await? else {
            return Ok(false);
        };

        if let Err(e) = self.provision(&upload).await {
            log::error!("provisioning {} failed: {e:?}", upload.id);
            self.queue
                .mark_failed(&upload.id, &format!("{e:?}"))
                .await?;
        }
        Ok(true)
    }

    async fn provision(&self, upload: &AcceptedUpload) -> Result<(), DomainError> {
        self.buildings.upsert(&upload.building).await?;
        self.events.publish_requested(&upload.building).await?;
        self.downstream
            .init_preferences(&upload.building.id, &upload.claims)
            .await;
        Ok(())
    }

    pub async fn resolve(&self, id: &str, error: Option<&str>) -> Result<(), DomainError> {
        match error {
            None => self.queue.mark_ready(id).await?,
            Some(e) => self.queue.mark_failed(id, e).await?,
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::fakes::{FakeEvents, FakeQueue, FakeStore, FakeSync, building};

    const LEASE: Duration = Duration::from_secs(30);

    struct Harness {
        provisioning: Provisioning,
        store: Arc<FakeStore>,
        queue: Arc<FakeQueue>,
        sync: Arc<FakeSync>,
        events: Arc<FakeEvents>,
    }

    fn harness_with_events(events: FakeEvents) -> Harness {
        let store = Arc::new(FakeStore::default());
        let queue = Arc::new(FakeQueue::default());
        let sync = Arc::new(FakeSync::default());
        let events = Arc::new(events);
        Harness {
            provisioning: Provisioning::new(
                store.clone(),
                queue.clone(),
                sync.clone(),
                events.clone(),
            ),
            store,
            queue,
            sync,
            events,
        }
    }

    fn harness() -> Harness {
        harness_with_events(FakeEvents::default())
    }

    #[tokio::test]
    async fn accepting_makes_the_upload_durable_before_any_work_happens() {
        let h = harness();

        let handle = h.provisioning.accept(building("b1"), "tok").await.unwrap();

        assert_eq!(handle, "b1", "the handle is the building's own id");
        assert_eq!(
            h.provisioning.status(&handle).await.unwrap(),
            UploadStatus::Pending
        );
        assert!(
            h.store.written.lock().unwrap().is_empty(),
            "accepting must not do the provisioning work"
        );
    }

    #[tokio::test]
    async fn provisioning_stores_the_twin_and_tells_downstream() {
        let h = harness();
        h.provisioning.accept(building("b1"), "tok").await.unwrap();

        assert!(h.provisioning.provision_next(LEASE).await.unwrap());

        assert_eq!(h.store.written.lock().unwrap().len(), 1);
        assert_eq!(
            h.events
                .published
                .lock()
                .unwrap()
                .iter()
                .map(|b| b.id.clone())
                .collect::<Vec<_>>(),
            ["b1"],
            "provisioning announces the building once it is durably written"
        );
        assert_eq!(*h.sync.seeded_preferences.lock().unwrap(), ["b1"]);
        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Pending,
            "a successful publish is not sensor-service's outcome -- \
             only resolve() may report ready"
        );
    }

    #[tokio::test]
    async fn resolving_ready_is_what_actually_marks_the_upload_ready() {
        let h = harness();
        h.provisioning.accept(building("b1"), "tok").await.unwrap();
        h.provisioning.provision_next(LEASE).await.unwrap();

        h.provisioning.resolve("b1", None).await.unwrap();

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Ready
        );
    }

    #[tokio::test]
    async fn resolving_with_an_error_marks_the_upload_failed() {
        let h = harness();
        h.provisioning.accept(building("b1"), "tok").await.unwrap();
        h.provisioning.provision_next(LEASE).await.unwrap();

        h.provisioning
            .resolve("b1", Some("sensor-service said no"))
            .await
            .unwrap();

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Failed
        );
        assert!(h.queue.errors.lock().unwrap()["b1"].contains("sensor-service said no"));
    }

    #[tokio::test]
    async fn redelivering_the_same_resolution_is_a_no_op() {
        let h = harness();
        h.provisioning.accept(building("b1"), "tok").await.unwrap();
        h.provisioning.provision_next(LEASE).await.unwrap();

        h.provisioning.resolve("b1", None).await.unwrap();
        h.provisioning.resolve("b1", None).await.unwrap();

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Ready
        );
    }

    #[tokio::test]
    async fn an_empty_queue_reports_there_was_nothing_to_do() {
        let h = harness();

        assert!(!h.provisioning.provision_next(LEASE).await.unwrap());
    }

    #[tokio::test]
    async fn a_refused_publish_fails_the_upload_rather_than_the_caller() {
        let h = harness_with_events(FakeEvents {
            refuse: true,
            ..FakeEvents::default()
        });
        h.provisioning.accept(building("b1"), "tok").await.unwrap();

        assert!(h.provisioning.provision_next(LEASE).await.unwrap());

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Failed
        );
        assert!(
            h.queue.errors.lock().unwrap()["b1"].contains("kafka said no"),
            "the reason has to survive for whoever polls the handle"
        );
    }

    #[tokio::test]
    async fn provisioning_the_same_upload_twice_converges_on_one_twin() {
        let h = harness();
        let upload = AcceptedUpload {
            id: "b1".to_string(),
            building: building("b1"),
            claims: "tok".to_string(),
        };
        h.queue.enqueue(&upload).await.unwrap();
        h.queue.enqueue(&upload).await.unwrap();

        h.provisioning.provision_next(LEASE).await.unwrap();
        h.provisioning.provision_next(LEASE).await.unwrap();

        assert_eq!(
            h.store.written.lock().unwrap().len(),
            1,
            "a redelivered upload must not produce a second twin"
        );
    }

    #[tokio::test]
    async fn an_unknown_handle_is_not_found() {
        let h = harness();

        assert!(matches!(
            h.provisioning.status("nope").await,
            Err(DomainError::NotFound(_))
        ));
    }
}
