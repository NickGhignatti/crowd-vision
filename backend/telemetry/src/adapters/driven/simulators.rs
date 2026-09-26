use crate::adapters::driven::dispatch::is_http;
use crate::kernel::ports::{DispatchError, SimulatorControl};
use crate::types::simulation::{
    Coordinates, Dimensions, SimulatedRoom, SimulatedSensor, SimulatorSpec,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

// A hung simulator raises no error, so without a timeout the dashboard's toggle never settles.
const TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Configured {
    url: String,
    kinds: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartBody<'a> {
    building_id: &'a str,
    sensors: Vec<SensorBody<'a>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    rooms: Vec<RoomBody<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SensorBody<'a> {
    sensor_id: &'a str,
    sensor_type: &'a str,
    room_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<Coordinates>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RoomBody<'a> {
    room_id: &'a str,
    position: Coordinates,
    dimensions: Dimensions,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StopBody<'a> {
    building_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    is_running: bool,
}

/// Drives each simulator's `/control/*` API, addressed by its name in `SIMULATORS`.
pub struct HttpSimulators {
    urls: HashMap<String, String>,
    client: reqwest::Client,
}

impl HttpSimulators {
    pub fn new(urls: HashMap<String, String>, timeout: Duration) -> Self {
        Self {
            urls,
            client: reqwest::Client::builder()
                .timeout(timeout)
                .build()
                .expect("reqwest client builds"),
        }
    }

    /// Parses `SIMULATORS` (`{name: {url, kinds}}`); blank means no simulators.
    pub fn from_json(raw: &str) -> anyhow::Result<(Self, Vec<SimulatorSpec>)> {
        let configured: HashMap<String, Configured> = match raw.trim() {
            "" => HashMap::new(),
            raw => serde_json::from_str(raw)?,
        };
        let mut urls = HashMap::new();
        let mut specs = Vec::new();
        for (name, simulator) in configured {
            if !is_http(&simulator.url) {
                anyhow::bail!("simulator {name}: url must be http or https");
            }
            urls.insert(name.clone(), simulator.url.trim_end_matches('/').to_owned());
            specs.push(SimulatorSpec {
                name,
                kinds: simulator.kinds,
            });
        }
        specs.sort_by(|a, b| a.name.cmp(&b.name));
        Ok((Self::new(urls, TIMEOUT), specs))
    }

    fn url(&self, simulator: &str, path: &str) -> Result<String, DispatchError> {
        self.urls
            .get(simulator)
            .map(|base| format!("{base}{path}"))
            .ok_or_else(|| DispatchError::Unconfigured(format!("no simulator named {simulator}.")))
    }
}

async fn send(request: reqwest::RequestBuilder) -> Result<reqwest::Response, DispatchError> {
    let response = request
        .send()
        .await
        .map_err(|error| DispatchError::Unreachable(error.to_string()))?;
    match response.status().is_success() {
        true => Ok(response),
        false => Err(DispatchError::Status(response.status().as_u16())),
    }
}

#[async_trait]
impl SimulatorControl for HttpSimulators {
    async fn start(
        &self,
        simulator: &str,
        building_id: &str,
        sensors: &[SimulatedSensor],
        rooms: &[SimulatedRoom],
    ) -> Result<(), DispatchError> {
        let body = StartBody {
            building_id,
            sensors: sensors
                .iter()
                .map(|sensor| SensorBody {
                    sensor_id: &sensor.sensor_id,
                    sensor_type: &sensor.sensor_type,
                    room_id: &sensor.room_id,
                    position: sensor.position,
                })
                .collect(),
            rooms: rooms
                .iter()
                .map(|room| RoomBody {
                    room_id: &room.room_id,
                    position: room.position,
                    dimensions: room.dimensions,
                })
                .collect(),
        };
        let url = self.url(simulator, "/control/start")?;
        send(self.client.post(url).json(&body)).await.map(drop)
    }

    async fn stop(&self, simulator: &str, building_id: &str) -> Result<(), DispatchError> {
        let url = self.url(simulator, "/control/stop")?;
        send(self.client.post(url).json(&StopBody { building_id }))
            .await
            .map(drop)
    }

    async fn is_running(&self, simulator: &str, building_id: &str) -> Result<bool, DispatchError> {
        let path = format!(
            "/control/status?buildingId={}",
            urlencoding::encode(building_id)
        );
        let response = send(self.client.get(self.url(simulator, &path)?)).await?;
        let status: Status = response
            .json()
            .await
            .map_err(|error| DispatchError::Unreachable(error.to_string()))?;
        Ok(status.is_running)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::ports::{DispatchError, SimulatorControl};
    use crate::types::simulation::{Coordinates, Dimensions, SimulatedRoom, SimulatedSensor};
    use serde_json::{Value, json};
    use std::collections::HashMap;
    use std::time::Duration;
    use wiremock::matchers::{body_json, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const WIRE: &str = include_str!("../../../../../schemas/fixtures/simulation-start.json");

    fn simulators(server: &MockServer, timeout: Duration) -> HttpSimulators {
        HttpSimulators::new(HashMap::from([("sim".to_owned(), server.uri())]), timeout)
    }

    fn fixture_case(consumer: &str) -> Value {
        let wire: Value = serde_json::from_str(WIRE).unwrap();
        wire["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|case| case["consumer"] == consumer)
            .unwrap()["body"]
            .clone()
    }

    fn coordinates(value: &Value) -> Coordinates {
        Coordinates {
            x: value["x"].as_f64().unwrap(),
            y: value["y"].as_f64().unwrap(),
            z: value["z"].as_f64().unwrap(),
        }
    }

    fn sensors_of(body: &Value) -> Vec<SimulatedSensor> {
        body["sensors"]
            .as_array()
            .unwrap()
            .iter()
            .map(|s| SimulatedSensor {
                sensor_id: s["sensorId"].as_str().unwrap().to_owned(),
                sensor_type: s["sensorType"].as_str().unwrap().to_owned(),
                room_id: s["roomId"].as_str().unwrap().to_owned(),
                position: s.get("position").map(coordinates),
            })
            .collect()
    }

    fn rooms_of(body: &Value) -> Vec<SimulatedRoom> {
        body.get("rooms")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|r| SimulatedRoom {
                room_id: r["roomId"].as_str().unwrap().to_owned(),
                position: coordinates(&r["position"]),
                dimensions: Dimensions {
                    width: r["dimensions"]["width"].as_f64().unwrap(),
                    height: r["dimensions"]["height"].as_f64().unwrap(),
                    depth: r["dimensions"]["depth"].as_f64().unwrap(),
                },
            })
            .collect()
    }

    async fn assert_start_posts(consumer: &str) {
        let body = fixture_case(consumer);
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/control/start"))
            .and(body_json(&body))
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&server)
            .await;

        simulators(&server, Duration::from_secs(5))
            .start(
                "sim",
                body["buildingId"].as_str().unwrap(),
                &sensors_of(&body),
                &rooms_of(&body),
            )
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn start_posts_the_body_the_fixture_pins() {
        assert_start_posts("sensor-simulator").await;
    }

    #[tokio::test]
    async fn start_posts_positions_and_rooms_as_the_fixture_pins() {
        assert_start_posts("ap-simulator").await;
    }

    #[tokio::test]
    async fn an_empty_start_still_sends_the_list() {
        let body = fixture_case("any");
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/control/start"))
            .and(body_json(&body))
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&server)
            .await;

        simulators(&server, Duration::from_secs(5))
            .start("sim", body["buildingId"].as_str().unwrap(), &[], &[])
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn stop_posts_the_building() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/control/stop"))
            .and(body_json(json!({ "buildingId": "b1" })))
            .respond_with(ResponseTemplate::new(200))
            .expect(1)
            .mount(&server)
            .await;

        simulators(&server, Duration::from_secs(5))
            .stop("sim", "b1")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn status_encodes_the_building_id_and_reads_is_running() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/control/status"))
            .and(query_param("buildingId", "b1&x=y"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "isRunning": true })))
            .expect(1)
            .mount(&server)
            .await;

        let running = simulators(&server, Duration::from_secs(5))
            .is_running("sim", "b1&x=y")
            .await
            .unwrap();
        assert!(running);
    }

    #[tokio::test]
    async fn an_error_status_is_reported_as_that_status() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let error = simulators(&server, Duration::from_secs(5))
            .stop("sim", "b1")
            .await
            .unwrap_err();
        assert!(matches!(error, DispatchError::Status(500)), "{error:?}");
    }

    #[tokio::test]
    async fn a_simulator_that_hangs_past_the_timeout_is_unreachable() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(2)))
            .mount(&server)
            .await;

        let error = simulators(&server, Duration::from_millis(100))
            .stop("sim", "b1")
            .await
            .unwrap_err();
        assert!(matches!(error, DispatchError::Unreachable(_)), "{error:?}");
    }

    #[tokio::test]
    async fn a_simulator_nobody_configured_is_unconfigured() {
        let server = MockServer::start().await;
        let error = simulators(&server, Duration::from_secs(5))
            .stop("ghost", "b1")
            .await
            .unwrap_err();
        assert!(matches!(error, DispatchError::Unconfigured(_)), "{error:?}");
    }

    #[test]
    fn config_names_each_simulator_and_the_kinds_it_claims() {
        let (_, specs) = HttpSimulators::from_json(
            r#"{ "sensor-simulator": { "url": "http://sensor-simulator:3000",
                                       "kinds": ["temperature", "peopleCount"] },
                 "aq-simulator":     { "url": "http://aq-simulator:3000",
                                       "kinds": ["airQuality"] } }"#,
        )
        .unwrap();
        let mut specs: Vec<(String, Vec<String>)> =
            specs.into_iter().map(|s| (s.name, s.kinds)).collect();
        specs.sort();
        assert_eq!(
            specs,
            vec![
                ("aq-simulator".to_owned(), vec!["airQuality".to_owned()]),
                (
                    "sensor-simulator".to_owned(),
                    vec!["temperature".to_owned(), "peopleCount".to_owned()]
                ),
            ]
        );
    }

    #[test]
    fn a_blank_or_empty_config_means_no_simulators() {
        for raw in ["", "  ", "{}"] {
            let (_, specs) = HttpSimulators::from_json(raw).unwrap();
            assert!(specs.is_empty(), "{raw:?}");
        }
    }

    #[test]
    fn a_malformed_config_is_refused() {
        assert!(HttpSimulators::from_json("{ not json").is_err());
        assert!(HttpSimulators::from_json(r#"{ "sim": { "url": "http://a" } }"#).is_err());
    }

    #[test]
    fn a_non_http_url_is_refused() {
        let error = HttpSimulators::from_json(
            r#"{ "sim": { "url": "file:///etc/passwd", "kinds": ["temperature"] } }"#,
        )
        .err()
        .expect("refused");
        assert!(error.to_string().contains("sim"), "{error}");
    }
}
