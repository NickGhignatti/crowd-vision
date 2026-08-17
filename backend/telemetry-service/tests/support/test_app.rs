use super::fakes::{StubAlerts, StubClock, StubDirectory, StubEvents, StubFanout};
use axum::Router;
use axum::body::Body;
use axum::http::{Request, Response, StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use sqlx::PgPool;
use std::sync::Arc;
use telemetry_service::adapters::driven::dispatch::HttpDispatch;
use telemetry_service::adapters::driven::postgres::{
    PgBuildings, PgReadings, PgSensors, PgThresholds,
};
use telemetry_service::kernel::actions::Actions;
use telemetry_service::kernel::ingest::Ingest;
use telemetry_service::kernel::ports::{
    Alerts, BuildingDirectory, BuildingStore, Clock, Fanout, ReadingStore, SensorStore,
    ThresholdStore,
};
use telemetry_service::kernel::readings::Readings;
use telemetry_service::kernel::registration::Registration;
use telemetry_service::kernel::registry::PluginRegistry;
use telemetry_service::kernel::sensors::Sensors;
use telemetry_service::kernel::thresholds::Thresholds;
use telemetry_service::plugins::air_quality::AirQualityPlugin;
use telemetry_service::plugins::people_count::PeopleCountPlugin;
use telemetry_service::plugins::temperature::TemperaturePlugin;
use telemetry_service::state::AppState;
use tower::ServiceExt;

pub struct TestApp {
    pub router: Router,
    pub pool: PgPool,
    pub alerts: Arc<StubAlerts>,
    pub fanout: Arc<StubFanout>,
}

pub const BINDINGS: &str = r#"{
  "tp-simulator": {
    "setTarget": { "path": "/control/receive", "fields": { "target": "value" } },
    "increase":  { "path": "/control/step", "fields": {} }
  }
}"#;

pub async fn test_app(pool: PgPool, domains: Vec<&str>) -> TestApp {
    test_app_with_bindings(pool, domains, BINDINGS).await
}

pub async fn test_app_with_bindings(pool: PgPool, domains: Vec<&str>, bindings: &str) -> TestApp {
    let registry = Arc::new(
        PluginRegistry::new(vec![
            Box::new(TemperaturePlugin),
            Box::new(PeopleCountPlugin),
            Box::new(AirQualityPlugin),
        ])
        .unwrap(),
    );

    let readings_store = Arc::new(PgReadings::new(pool.clone(), registry.clone()));
    let thresholds_store = Arc::new(PgThresholds::new(pool.clone()));
    let sensors_store = Arc::new(PgSensors::new(pool.clone()));
    let buildings_store = Arc::new(PgBuildings::new(pool.clone()));
    let dispatch = Arc::new(HttpDispatch::from_json(pool.clone(), bindings).unwrap());
    let alerts = Arc::new(StubAlerts::default());
    let fanout = Arc::new(StubFanout::default());
    let directory = Arc::new(StubDirectory {
        domains: domains.iter().map(|d| (*d).to_owned()).collect(),
    });

    let state = Arc::new(AppState {
        registry: registry.clone(),
        directory: directory.clone() as Arc<dyn BuildingDirectory>,
        dispatch: dispatch.clone(),
        ingest: Ingest {
            registry: registry.clone(),
            readings: readings_store.clone() as Arc<dyn ReadingStore>,
            thresholds: thresholds_store.clone() as Arc<dyn ThresholdStore>,
            fanout: fanout.clone() as Arc<dyn Fanout>,
            alerts: alerts.clone() as Arc<dyn Alerts>,
            clock: Arc::new(StubClock::default()) as Arc<dyn Clock>,
        },
        readings: Readings {
            registry: registry.clone(),
            store: readings_store.clone() as Arc<dyn ReadingStore>,
            clock: Arc::new(StubClock::default()) as Arc<dyn Clock>,
        },
        thresholds: Thresholds {
            registry: registry.clone(),
            store: thresholds_store.clone() as Arc<dyn ThresholdStore>,
        },
        sensors: Sensors {
            registry: registry.clone(),
            store: sensors_store.clone() as Arc<dyn SensorStore>,
        },
        actions: Actions {
            registry: registry.clone(),
            dispatch: dispatch.clone(),
        },
        registration: Registration {
            buildings: buildings_store.clone() as Arc<dyn BuildingStore>,
            thresholds: thresholds_store.clone() as Arc<dyn ThresholdStore>,
            events: Arc::new(StubEvents),
        },
    });

    TestApp {
        router: telemetry_service::router(state),
        pool,
        alerts,
        fanout,
    }
}

pub fn claims_with(memberships: Vec<(&str, &str)>) -> String {
    let payload = json!({
        "sub": "u1",
        "memberships": memberships.iter().map(|(domain, role)| json!({
            "domain": domain, "role": role
        })).collect::<Vec<_>>(),
    });
    STANDARD.encode(payload.to_string())
}

impl TestApp {
    pub async fn send(&self, request: Request<Body>) -> Response<Body> {
        self.router.clone().oneshot(request).await.unwrap()
    }

    pub async fn get(&self, uri: &str, claims: Option<&str>) -> (StatusCode, Value) {
        let mut builder = Request::builder().method("GET").uri(uri);
        if let Some(claims) = claims {
            builder = builder.header("x-gateway-claims", claims);
        }
        let response = self.send(builder.body(Body::empty()).unwrap()).await;
        read_json(response).await
    }

    pub async fn send_json(
        &self,
        method: &str,
        uri: &str,
        claims: Option<&str>,
        body: Value,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder()
            .method(method)
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(claims) = claims {
            builder = builder.header("x-gateway-claims", claims);
        }
        let response = self
            .send(builder.body(Body::from(body.to_string())).unwrap())
            .await;
        read_json(response).await
    }
}

async fn read_json(response: Response<Body>) -> (StatusCode, Value) {
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    (status, body)
}
