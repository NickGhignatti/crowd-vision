use async_trait::async_trait;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::json;
use std::time::Duration;

use crate::domain::Building;
use crate::service::ports::DownstreamSync;

const TIMEOUT: Duration = Duration::from_secs(5);

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .expect("an HTTP client with a timeout is constructible")
}

#[derive(Clone)]
pub struct OutboundConfig {
    pub telemetry_url: String,
    pub dashboard_url: String,
    pub notification_url: String,
    pub sync_enabled: bool,
    pub client: reqwest::Client,
}

#[async_trait]
impl DownstreamSync for OutboundConfig {
    async fn clone_thresholds(
        &self,
        building: &Building,
        max_temperature: Option<f64>,
        claims: &str,
    ) -> anyhow::Result<()> {
        sync_building_clone(self, building, max_temperature, Some(claims)).await
    }

    async fn init_preferences(&self, building_id: &str, claims: &str) {
        init_building_preferences(self, building_id, Some(claims)).await
    }

    async fn notify_provisioning_failed(&self, building_id: &str, error: &str) {
        notify_provisioning_failed(self, building_id, error).await
    }
}

fn auth_headers(claims_header: Option<&str>) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("content-type", "application/json".parse().unwrap());
    if let Some(token) = claims_header
        && let Ok(value) = token.parse()
    {
        headers.insert("x-gateway-claims", value);
    }
    headers
}

pub async fn sync_building_clone(
    config: &OutboundConfig,
    building: &Building,
    max_temperature: Option<f64>,
    claims_header: Option<&str>,
) -> anyhow::Result<()> {
    if !config.sync_enabled {
        return Ok(());
    }

    let mut payload = json!({
        "name": building.name,
        "rooms": building.rooms.iter().map(|r| json!({
            "id": r.id,
            "name": if r.name.trim().is_empty() { r.id.clone() } else { r.name.clone() },
        })).collect::<Vec<_>>(),
    });
    if let Some(max_temp) = max_temperature {
        payload["maxTemperature"] = json!(max_temp);
    }

    let url = format!(
        "{}/thresholds/buildings/{}",
        config.telemetry_url,
        urlencoding::encode(&building.id)
    );
    let response = config
        .client
        .put(&url)
        .headers(auth_headers(claims_header))
        .json(&payload)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let details = response.text().await.unwrap_or_default();
        anyhow::bail!("Failed to sync sensor threshold clone: {status} {details}");
    }
    Ok(())
}

pub async fn init_building_preferences(
    config: &OutboundConfig,
    building_id: &str,
    claims_header: Option<&str>,
) {
    if !config.sync_enabled {
        return;
    }
    let url = format!(
        "{}/preferences/init/{}",
        config.dashboard_url,
        urlencoding::encode(building_id)
    );
    if let Err(err) = config
        .client
        .post(&url)
        .headers(auth_headers(claims_header))
        .send()
        .await
    {
        log::error!("[contracts] failed to init building preferences: {err}");
    }
}

// The failure notification fires from the provisioning worker (telemetry's own
// callback, or a refused Kafka publish) -- there is no end-user request to forward
// claims from, so it authenticates as a system caller (mirrors notification's
// own SYSTEM_CLAIMS_HEADER for its Redis-triggered alerts).
fn system_claims_header() -> String {
    STANDARD.encode(
        r#"{"sub":"system:digital-twin","accountName":"system:digital-twin","memberships":[]}"#,
    )
}

pub async fn notify_provisioning_failed(config: &OutboundConfig, building_id: &str, error: &str) {
    if !config.sync_enabled {
        return;
    }
    let url = format!("{}/trigger", config.notification_url);
    let payload = json!({
        "buildingName": building_id,
        "message": format!("Provisioning failed for building {building_id}: {error}"),
        "type": "danger",
    });
    if let Err(err) = config
        .client
        .post(&url)
        .headers(auth_headers(Some(&system_claims_header())))
        .json(&payload)
        .send()
        .await
    {
        log::error!(
            "[notification] failed to notify provisioning failure for {building_id}: {err}"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Coordinates, Dimensions, Room};
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn building() -> Building {
        Building {
            id: "b1".to_string(),
            name: "B1".to_string(),
            rooms: vec![Room {
                id: "r1".to_string(),
                name: "R1".to_string(),
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

    async fn config(server: &MockServer) -> OutboundConfig {
        OutboundConfig {
            telemetry_url: server.uri(),
            dashboard_url: server.uri(),
            notification_url: server.uri(),
            sync_enabled: true,
            client: client(),
        }
    }

    #[tokio::test]
    async fn a_stalled_downstream_times_out_instead_of_hanging() {
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/thresholds/buildings/b1"))
            .respond_with(ResponseTemplate::new(200).set_delay(TIMEOUT * 3))
            .mount(&server)
            .await;

        let cfg = config(&server).await;
        let started = std::time::Instant::now();
        let result = sync_building_clone(&cfg, &building(), None, None).await;

        assert!(result.is_err());
        assert!(started.elapsed() < TIMEOUT * 2);
    }

    #[tokio::test]
    async fn forwards_the_callers_claims_header_verbatim() {
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/thresholds/buildings/b1"))
            .and(header("x-gateway-claims", "tok-123"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let cfg = config(&server).await;
        sync_building_clone(&cfg, &building(), None, Some("tok-123"))
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn omits_the_claims_header_when_no_token_is_provided() {
        let server = MockServer::start().await;
        Mock::given(method("PUT"))
            .and(path("/thresholds/buildings/b1"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let cfg = config(&server).await;
        sync_building_clone(&cfg, &building(), None, None)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn skipped_entirely_when_sync_is_disabled() {
        let cfg = OutboundConfig {
            telemetry_url: "http://127.0.0.1:1".to_string(),
            dashboard_url: "http://127.0.0.1:1".to_string(),
            notification_url: "http://127.0.0.1:1".to_string(),
            sync_enabled: false,
            client: reqwest::Client::new(),
        };
        sync_building_clone(&cfg, &building(), None, None)
            .await
            .unwrap();
        init_building_preferences(&cfg, "b1", None).await;
        notify_provisioning_failed(&cfg, "b1", "boom").await;
    }

    #[tokio::test]
    async fn init_building_preferences_forwards_the_callers_claims_header() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/preferences/init/b1"))
            .and(header("x-gateway-claims", "tok-123"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let cfg = config(&server).await;
        init_building_preferences(&cfg, "b1", Some("tok-123")).await;
    }

    #[tokio::test]
    async fn notify_provisioning_failed_never_fails_the_caller_on_transport_error() {
        let cfg = OutboundConfig {
            telemetry_url: "http://127.0.0.1:1".to_string(),
            dashboard_url: "http://127.0.0.1:1".to_string(),
            notification_url: "http://127.0.0.1:1".to_string(),
            sync_enabled: true,
            client: reqwest::Client::new(),
        };
        notify_provisioning_failed(&cfg, "b1", "boom").await;
    }

    #[tokio::test]
    async fn notify_provisioning_failed_posts_to_the_trigger_endpoint_as_a_system_caller() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/trigger"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let cfg = config(&server).await;
        notify_provisioning_failed(&cfg, "b1", "telemetry said no").await;
    }
}
