use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::StatusCode;
use cucumber::World;
use serde_json::Value;

use digital_twin::service::provisioning::Provisioning;

use super::{fixtures, http_client, test_app};

pub const READY_TIMEOUT: Duration = Duration::from_secs(10);
pub const POLL_INTERVAL: Duration = Duration::from_millis(50);

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
        let app = test_app::build("cucumber").await;
        Self {
            router: app.router,
            status: StatusCode::OK,
            body: Value::Null,
            building_id: None,
            provisioning: app.provisioning,
            load_run: None,
        }
    }

    pub async fn call(&mut self, method: &str, path: &str, domain: &str, body: Option<Value>) {
        let res = http_client::send(
            self.router.clone(),
            method,
            path,
            Some(&fixtures::admin_of(domain)),
            body,
        )
        .await;
        self.status = res.status;
        self.body = res.body;
    }

    pub fn handle(&self) -> &str {
        self.building_id
            .as_deref()
            .unwrap_or_else(|| panic!("no tracking handle was issued; body was {}", self.body))
    }
}
