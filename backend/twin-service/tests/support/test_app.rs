use std::sync::Arc;

use axum::Router;
use uuid::Uuid;

use twin_service::adapters::driven::outbound::OutboundConfig;
use twin_service::adapters::driven::persistence::db::{self, MongoBuildings};
use twin_service::adapters::driven::persistence::jobs::MongoUploadQueue;
use twin_service::adapters::driving::worker;
use twin_service::adapters::ratelimit::RateLimiter;
use twin_service::build_router;
use twin_service::domain::Building;
use twin_service::service::buildings::Buildings;
use twin_service::service::ports::RegistrationEvents;
use twin_service::service::provisioning::Provisioning;
use twin_service::state::AppState;

struct InstantlyResolvingEvents {
    tx: tokio::sync::mpsc::UnboundedSender<String>,
}

#[async_trait::async_trait]
impl RegistrationEvents for InstantlyResolvingEvents {
    async fn publish_building_registration_request(
        &self,
        building: &Building,
    ) -> anyhow::Result<()> {
        let _ = self.tx.send(building.id.clone());
        Ok(())
    }
}

pub struct TestApp {
    pub router: Router,
    pub provisioning: Arc<Provisioning>,
}

/// The one place that wires a full twin-service app for tests: a fresh,
/// randomly-named Mongo db (so tests never see each other's data) plus an
/// events port that resolves registrations instantly instead of round-tripping
/// a real broker. `label` only affects the db name, so a stuck test run is
/// easy to trace back to whichever suite left it behind.
pub async fn build(label: &str) -> TestApp {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let db_name = format!("twin_service_{label}_{}", Uuid::new_v4().simple());
    let buildings = db::connect(&uri, &db_name)
        .await
        .expect("connect to test MongoDB");

    let outbound = OutboundConfig {
        sensor_service_url: "http://127.0.0.1:1".to_string(),
        contracts_service_url: "http://127.0.0.1:1".to_string(),
        notification_service_url: "http://127.0.0.1:1".to_string(),
        sync_enabled: false,
        client: reqwest::Client::new(),
    };
    let store = Arc::new(MongoBuildings::new(buildings.clone()));
    let queue = Arc::new(MongoUploadQueue::from_building_collection(&buildings));
    let downstream = Arc::new(outbound);
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    let events = Arc::new(InstantlyResolvingEvents { tx });

    let provisioning = Arc::new(Provisioning::new(
        store.clone(),
        queue,
        downstream.clone(),
        events,
    ));
    worker::spawn(provisioning.clone());
    let resolver = provisioning.clone();
    tokio::spawn(async move {
        while let Some(id) = rx.recv().await {
            let _ = resolver.resolve(&id, None).await;
        }
    });

    let router = build_router(AppState {
        buildings: Arc::new(Buildings::new(store, downstream)),
        provisioning: provisioning.clone(),
        rate_limiter: RateLimiter::new(false),
    });

    TestApp {
        router,
        provisioning,
    }
}

/// Convenience for the common case: a test that only ever talks to the app
/// over HTTP and has no need for the `Provisioning` handle directly.
pub async fn app() -> Router {
    build("api").await.router
}
