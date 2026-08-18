use std::sync::Arc;
use std::time::Duration;

use crate::domain::identity::GatewayClaims;
use crate::domain::{AcceptedUpload, Building, DomainError, UploadStatus};
use crate::service::authz;
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
            self.fail(&upload.id, &format!("{e:?}")).await?;
        }
        Ok(true)
    }

    async fn provision(&self, upload: &AcceptedUpload) -> Result<(), DomainError> {
        self.buildings.upsert(&upload.building).await?;
        self.events
            .publish_building_registration_request(&upload.building)
            .await?;
        self.downstream
            .init_preferences(&upload.building.id, &upload.claims)
            .await;
        Ok(())
    }

    pub async fn resync(&self, id: &str, claims: &GatewayClaims) -> Result<(), DomainError> {
        let building = self
            .buildings
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound(format!("No building with id: \"{id}\"")))?;

        if !authz::can_edit_domains(claims, &building.domains) {
            return Err(DomainError::Forbidden(
                "Requires an editing role in one of this building's domains".to_string(),
            ));
        }

        self.events
            .publish_building_registration_request(&building)
            .await?;
        Ok(())
    }

    pub async fn resolve(
        &self,
        id: &str,
        error: Option<&str>,
    ) -> Result<Option<Duration>, DomainError> {
        match error {
            None => Ok(self.queue.mark_ready(id).await?),
            Some(e) => self.fail(id, e).await,
        }
    }

    // A failed upload must not leave an orphaned twin behind -- whether provisioning
    // failed before sensor-service ever heard about it, or sensor-service rejected it later.
    // Notify before deleting: notification-service resolves the building's domains by
    // calling back into twin-service, so the twin must still exist when it does.
    async fn fail(&self, id: &str, error: &str) -> Result<Option<Duration>, DomainError> {
        let Some(elapsed) = self.queue.mark_failed(id, error).await? else {
            log::warn!("registration of {id} failed after the upload was resolved: {error}");
            return Ok(None);
        };
        self.downstream.notify_provisioning_failed(id, error).await;
        self.buildings.delete(id).await?;
        Ok(Some(elapsed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::fakes::{
        FakeEvents, FakeQueue, FakeStore, FakeSync, building, claims_with,
    };

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
        assert!(
            h.store.get("b1").is_none(),
            "a building sensor-service rejects must not linger in the store"
        );
        assert_eq!(
            h.sync.failure_notifications.lock().unwrap()[0],
            ("b1".to_string(), "sensor-service said no".to_string())
        );
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
    async fn resolving_reports_elapsed_time_only_on_the_first_resolution() {
        let h = harness();
        h.provisioning.accept(building("b1"), "tok").await.unwrap();
        h.provisioning.provision_next(LEASE).await.unwrap();

        let first = h.provisioning.resolve("b1", None).await.unwrap();
        let redelivery = h.provisioning.resolve("b1", None).await.unwrap();

        assert!(
            first.is_some(),
            "the first resolution must report how long provisioning took"
        );
        assert!(
            redelivery.is_none(),
            "a redelivered resolution must not be counted again"
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
        assert!(
            h.store.get("b1").is_none(),
            "the twin written before the refused publish must not survive the failure"
        );
        assert_eq!(h.sync.failure_notifications.lock().unwrap().len(), 1);
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
    async fn resyncing_republishes_the_registration_request_for_a_building_that_already_exists() {
        let h = harness();
        h.store.seed(building("b1"));

        h.provisioning
            .resync("b1", &claims_with(vec![("eng", "business_admin")]))
            .await
            .unwrap();

        assert_eq!(
            h.events
                .published
                .lock()
                .unwrap()
                .iter()
                .map(|b| b.id.clone())
                .collect::<Vec<_>>(),
            ["b1"]
        );
        assert!(
            h.provisioning.status("b1").await.is_err(),
            "a resync must not invent an upload record for a building that was never queued"
        );
    }

    #[tokio::test]
    async fn resyncing_an_unknown_building_is_not_found() {
        let h = harness();

        assert!(matches!(
            h.provisioning
                .resync("nope", &claims_with(vec![("eng", "business_admin")]))
                .await,
            Err(DomainError::NotFound(_))
        ));
        assert!(h.events.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn resyncing_without_an_editing_role_is_forbidden() {
        let h = harness();
        h.store.seed(building("b1"));

        assert!(matches!(
            h.provisioning
                .resync("b1", &claims_with(vec![("eng", "standard_customer")]))
                .await,
            Err(DomainError::Forbidden(_))
        ));
        assert!(h.events.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_failure_arriving_after_the_upload_was_resolved_leaves_the_twin_alone() {
        let h = harness();
        h.provisioning.accept(building("b1"), "tok").await.unwrap();
        h.provisioning.provision_next(LEASE).await.unwrap();
        h.provisioning.resolve("b1", None).await.unwrap();

        assert!(
            h.provisioning
                .resolve("b1", Some("telemetry said no"))
                .await
                .unwrap()
                .is_none()
        );

        assert!(
            h.store.get("b1").is_some(),
            "a resync rejected downstream must not delete a building that was already live"
        );
        assert!(h.sync.failure_notifications.lock().unwrap().is_empty());
        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Ready
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
