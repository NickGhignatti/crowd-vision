use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use cucumber::{World, given, then, when};
use serde_json::{Value, json};
use tower::ServiceExt;
use uuid::Uuid;

use std::sync::Arc;

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

// How long a step waits on work the worker performs out of band.
const READY_TIMEOUT: Duration = Duration::from_secs(10);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

// Stands in for the Kafka completion consumer (K4): a real broker isn't
// available in this suite, so this resolves an upload the instant it's
// announced, as if sensor-service always answers "ready" immediately.
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

#[derive(World)]
#[world(init = Self::new)]
struct TwinWorld {
    router: Router,
    status: StatusCode,
    body: Value,
    building_id: Option<String>,
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
            provisioning,
            rate_limiter: RateLimiter::new(false),
        };

        Self {
            router: build_router(state),
            status: StatusCode::OK,
            body: Value::Null,
            building_id: None,
        }
    }

    async fn call(&mut self, method: &str, path: &str, domain: &str, body: Option<Value>) {
        let builder = Request::builder()
            .method(method)
            .uri(path)
            .header("x-gateway-claims", admin_of(domain));
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

    fn handle(&self) -> &str {
        self.building_id
            .as_deref()
            .unwrap_or_else(|| panic!("no tracking handle was issued; body was {}", self.body))
    }
}

fn admin_of(domain: &str) -> String {
    BASE64.encode(
        json!({
            "sub": "u1",
            "accountName": "tester",
            "memberships": [{ "domain": domain, "role": "business_admin" }]
        })
        .to_string(),
    )
}

fn building_with(dimensions: Value) -> Value {
    json!({
        "name": "Engineering Block",
        "domains": ["test-domain"],
        "rooms": [{
            "id": "Room-101",
            "name": "Room 101",
            "capacity": 20,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": dimensions,
            "color": "#ffffff"
        }]
    })
}

#[when(expr = "I upload a valid building description to organization {string}")]
async fn upload_valid(world: &mut TwinWorld, domain: String) {
    let payload = building_with(json!({ "width": 10, "height": 10, "depth": 10 }));
    world
        .call("POST", "/register", &domain, Some(payload))
        .await;
    world.building_id = world
        .body
        .get("buildingId")
        .and_then(Value::as_str)
        .map(str::to_owned);
}

#[when(expr = "I upload a building description with an invalid room to organization {string}")]
async fn upload_invalid(world: &mut TwinWorld, domain: String) {
    let payload = building_with(json!({ "width": -1, "height": 10, "depth": 10 }));
    world
        .call("POST", "/register", &domain, Some(payload))
        .await;
    world.building_id = world
        .body
        .get("buildingId")
        .and_then(Value::as_str)
        .map(str::to_owned);
}

#[then("the upload is acknowledged with a tracking handle")]
async fn acknowledged(world: &mut TwinWorld) {
    assert_eq!(
        world.status,
        StatusCode::ACCEPTED,
        "expected the upload to be accepted for later provisioning, body was {}",
        world.body
    );
    assert!(
        world.building_id.is_some(),
        "no tracking handle in the acknowledgement: {}",
        world.body
    );
}

#[then("the upload is refused without a tracking handle")]
async fn refused(world: &mut TwinWorld) {
    assert_eq!(
        world.status,
        StatusCode::BAD_REQUEST,
        "expected the malformed description to be refused outright, body was {}",
        world.body
    );
    assert!(
        world.building_id.is_none(),
        "a malformed upload must never be acknowledged, got handle {:?}",
        world.building_id
    );
}

#[then(expr = "the tracking handle eventually reports {string}")]
async fn handle_reports(world: &mut TwinWorld, expected: String) {
    let path = format!("/building/{}/status", world.handle());
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        world.call("GET", &path, "test-domain", None).await;
        let reported = world.body.get("status").and_then(Value::as_str);
        if reported == Some(expected.as_str()) {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "handle still reported {reported:?} after {READY_TIMEOUT:?}, expected {expected:?}"
        );
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

#[then("the twin is viewable")]
async fn twin_viewable(world: &mut TwinWorld) {
    let path = format!("/building/{}", world.handle());
    world.call("GET", &path, "test-domain", None).await;
    assert_eq!(
        world.status,
        StatusCode::OK,
        "a ready twin must be viewable, body was {}",
        world.body
    );
}

#[given(expr = "a twin has been provisioned in organization {string}")]
async fn twin_provisioned(world: &mut TwinWorld, domain: String) {
    upload_valid(world, domain).await;
    acknowledged(world).await;
    handle_reports(world, "ready".to_string()).await;
}

#[when(expr = "a member of organization {string} lists its buildings")]
async fn lists_buildings(world: &mut TwinWorld, domain: String) {
    let path = format!("/buildings/{domain}");
    world.call("GET", &path, &domain, None).await;
}

#[then(expr = "organization {string} holds no buildings")]
async fn holds_no_buildings(world: &mut TwinWorld, domain: String) {
    lists_buildings(world, domain).await;
    no_building_listed(world).await;
}

#[then("no building is listed")]
async fn no_building_listed(world: &mut TwinWorld) {
    let listed = world.body.as_array().map_or(0, Vec::len);
    assert_eq!(listed, 0, "expected no buildings, got {}", world.body);
}

#[tokio::main]
async fn main() {
    // Serial: every scenario opens its own database, and cucumber's default
    // fan-out overwhelms the connection pool before the first step runs.
    TwinWorld::cucumber()
        .max_concurrent_scenarios(1)
        .run_and_exit("tests/features")
        .await;
}
