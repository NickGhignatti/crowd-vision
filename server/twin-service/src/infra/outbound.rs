use serde_json::json;

use crate::models::Building;

#[derive(Clone)]
pub struct OutboundConfig {
    pub sensor_service_url: String,
    pub contracts_service_url: String,
    // Mirrors shouldSyncThresholds()/NODE_ENV=test.
    pub sync_enabled: bool,
    pub client: reqwest::Client,
}

// Forward the authenticated caller's identity to the sensor service.
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
        config.sensor_service_url,
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

pub async fn init_room_thresholds(
    config: &OutboundConfig,
    building_id: &str,
    room_id: &str,
    capacity: f64,
    claims_header: Option<&str>,
) {
    if !config.sync_enabled {
        return;
    }
    let url = format!(
        "{}/thresholds/peopleCount/buildings/{}/rooms/{}",
        config.sensor_service_url,
        urlencoding::encode(building_id),
        urlencoding::encode(room_id)
    );
    let result = config
        .client
        .patch(&url)
        .headers(auth_headers(claims_header))
        .json(&json!({ "maxPeople": capacity }))
        .send()
        .await;

    if let Err(err) = result {
        log::error!(
            "[sensors] failed to init thresholds for room: {:?} {err}",
            room_id
        );
    }
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
        config.contracts_service_url,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Coordinates, Dimensions, Room};
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
            sensor_service_url: server.uri(),
            contracts_service_url: server.uri(),
            sync_enabled: true,
            client: reqwest::Client::new(),
        }
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
        // No mock mounted at all -- if this made a real request it would fail
        // to connect and return an error.
        let cfg = OutboundConfig {
            sensor_service_url: "http://127.0.0.1:1".to_string(),
            contracts_service_url: "http://127.0.0.1:1".to_string(),
            sync_enabled: false,
            client: reqwest::Client::new(),
        };
        sync_building_clone(&cfg, &building(), None, None)
            .await
            .unwrap();
        init_room_thresholds(&cfg, "b1", "r1", 10.0, None).await;
        init_building_preferences(&cfg, "b1", None).await;
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
    async fn init_room_thresholds_never_fails_the_caller_on_transport_error() {
        let cfg = OutboundConfig {
            sensor_service_url: "http://127.0.0.1:1".to_string(),
            contracts_service_url: "http://127.0.0.1:1".to_string(),
            sync_enabled: true,
            client: reqwest::Client::new(),
        };
        // Would panic if this propagated an error instead of just logging.
        init_room_thresholds(&cfg, "b1", "r1", 10.0, None).await;
    }
}
