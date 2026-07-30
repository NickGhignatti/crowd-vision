use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use cucumber::World;
use serde_json::Value;
use tower::ServiceExt;
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

pub const READY_TIMEOUT: Duration = Duration::from_secs(10);
pub const POLL_INTERVAL: Duration = Duration::from_millis(50);

struct InstantlyResolvingEvents {
    tx: tokio::sync::mpsc::UnboundedSender<String>,
}

#[async_trait::async_trait]
impl RegistrationEvents for InstantlyResolvingEvents {
    async fn publish_requested(&self, building: &Building) -> anyhow::Result<()> {
        let _ = self.tx.send(building.id.clone());
        Ok(())
    }
}

pub struct LoadRun {
    pub accept_latencies: Vec<Duration>,
    pub available_latencies: Vec<Duration>,
}

#[derive(World)]
#[world(init = Self::new)]
pub struct TwinWorld {
    pub router: Router,
    pub status: StatusCode,
    pub body: Value,
    pub building_id: Option<String>,
    pub provisioning: Arc<Provisioning>,
    pub load_run: Option<LoadRun>,
}

impl std::fmt::Debug for TwinWorld {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TwinWorld")
            .field("status", &self.status)
            .field("body", &self.body)
            .field("building_id", &self.building_id)
            .finish_non_exhaustive()
    }
}

impl TwinWorld {
    async fn new() -> Self {
        let uri =
            std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let db_name = format!("twin_service_cucumber_{}", Uuid::new_v4().simple());
        let buildings = db::connect(&uri, &db_name)
            .await
            .expect("connect to test MongoDB");

        let outbound = OutboundConfig {
            sensor_service_url: "http://127.0.0.1:1".to_string(),
            contracts_service_url: "http://127.0.0.1:1".to_string(),
            sync_enabled: false,
            client: reqwest::Client::new(),
        };
        let store = Arc::new(MongoBuildings::new(buildings.clone()));
        let queue = Arc::new(MongoUploadQueue::beside(&buildings));
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

        let state = AppState {
            buildings: Arc::new(Buildings::new(store, downstream)),
            provisioning: provisioning.clone(),
            rate_limiter: RateLimiter::new(false),
        };

        Self {
            router: build_router(state),
            status: StatusCode::OK,
            body: Value::Null,
            building_id: None,
            provisioning,
            load_run: None,
        }
    }

    pub async fn call(&mut self, method: &str, path: &str, domain: &str, body: Option<Value>) {
        let builder = Request::builder()
            .method(method)
            .uri(path)
            .header("x-gateway-claims", super::fixtures::admin_of(domain));
        let request = match body {
            Some(payload) => builder
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(payload.to_string()))
                .unwrap(),
            None => builder.body(Body::empty()).unwrap(),
        };

        let response = self.router.clone().oneshot(request).await.unwrap();
        self.status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        self.body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    }

    pub fn handle(&self) -> &str {
        self.building_id
            .as_deref()
            .unwrap_or_else(|| panic!("no tracking handle was issued; body was {}", self.body))
    }
}
