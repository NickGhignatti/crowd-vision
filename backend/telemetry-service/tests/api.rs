mod support;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::json;
use support::test_app::{claims_with, test_app};
use support::{fresh_db, seed_building};
use telemetry_contracts::MetricsDiscoveryResponse;
use telemetry_service::adapters::ingest_auth::IngestKey;

const BASE_MS: i64 = 1_700_000_000_000;

fn staff() -> String {
    claims_with(vec![("eng", "business_staff")])
}

fn customer() -> String {
    claims_with(vec![("eng", "standard_customer")])
}

fn outsider() -> String {
    claims_with(vec![("other", "business_admin")])
}

fn temperature(room: &str, ts_ms: i64, value: f64) -> serde_json::Value {
    json!({ "type": "temperature", "buildingId": "b1", "roomId": room,
            "timestamp": ts_ms, "temperature": value })
}

#[tokio::test]
async fn a_request_without_claims_is_unauthorized() {
    let app = test_app(fresh_db("auth_missing").await, vec!["eng"]).await;
    let (status, _) = app
        .get("/temperature/latest?building=b1&roomId=r1", None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_malformed_claims_header_is_unauthorized() {
    let app = test_app(fresh_db("auth_malformed").await, vec!["eng"]).await;
    let (status, _) = app
        .get(
            "/temperature/latest?building=b1&roomId=r1",
            Some("!!!not base64!!!"),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn claims_without_a_subject_are_unauthorized() {
    use base64::Engine;
    let app = test_app(fresh_db("auth_nosub").await, vec!["eng"]).await;
    let encoded = base64::engine::general_purpose::STANDARD.encode(r#"{"memberships":[]}"#);
    let (status, _) = app
        .get("/temperature/latest?building=b1&roomId=r1", Some(&encoded))
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn a_member_of_another_domain_is_forbidden() {
    let app = test_app(fresh_db("auth_forbidden").await, vec!["eng"]).await;
    let (status, _) = app
        .get(
            "/temperature/latest?building=b1&roomId=r1",
            Some(&outsider()),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_reader_cannot_edit() {
    let app = test_app(fresh_db("auth_readonly").await, vec!["eng"]).await;
    let (status, _) = app
        .send_json(
            "PATCH",
            "/thresholds/temperature/buildings/b1",
            Some(&customer()),
            json!({ "maxTemp": 25.0 }),
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_signed_reading_is_accepted_without_any_user_credential() {
    let app = test_app(fresh_db("ingest_signed").await, vec!["eng"]).await;
    let (status, body) = app.ingest(temperature("r1", BASE_MS, 21.5)).await;
    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(body["accepted"], true);
    assert_eq!(body["type"], "temperature");
    assert_eq!(app.fanout.published.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn an_unsigned_reading_is_unauthorized() {
    let app = test_app(fresh_db("ingest_unsigned").await, vec!["eng"]).await;
    let (status, _) = app.ingest_unsigned(temperature("r1", BASE_MS, 21.5)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(app.fanout.published.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_reading_signed_with_the_wrong_secret_is_unauthorized() {
    let app = test_app(fresh_db("ingest_wrongkey").await, vec!["eng"]).await;
    let forged = IngestKey::new("attacker-secret-0123456789abcdefgh").unwrap();
    let raw = temperature("r1", BASE_MS, 21.5).to_string();
    let (status, _) = app.ingest_signed(&raw, &forged.sign(raw.as_bytes())).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(app.fanout.published.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_body_altered_after_signing_is_unauthorized() {
    let app = test_app(fresh_db("ingest_tampered").await, vec!["eng"]).await;
    let signed = temperature("r1", BASE_MS, 21.5).to_string();
    let signature = app.ingest_key.sign(signed.as_bytes());
    let tampered = temperature("r1", BASE_MS, 99.0).to_string();
    let (status, _) = app.ingest_signed(&tampered, &signature).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert!(app.fanout.published.lock().unwrap().is_empty());
}

#[tokio::test]
async fn a_malformed_signature_header_is_unauthorized() {
    let app = test_app(fresh_db("ingest_malformed_sig").await, vec!["eng"]).await;
    let raw = temperature("r1", BASE_MS, 21.5).to_string();
    let (status, _) = app.ingest_signed(&raw, "not-a-signature").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn ingesting_an_unknown_sensor_type_is_not_found() {
    let app = test_app(fresh_db("ingest_unknown").await, vec!["eng"]).await;
    let (status, body) = app
        .ingest(
            json!({ "type": "humidity", "buildingId": "b1", "roomId": "r1",
                    "timestamp": BASE_MS, "temperature": 21.5 }),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["type"], "Not Found Error");
}

#[tokio::test]
async fn ingesting_an_invalid_payload_is_rejected_with_the_offending_fields() {
    let app = test_app(fresh_db("ingest_invalid").await, vec!["eng"]).await;
    let (status, body) = app
        .ingest(json!({ "type": "temperature", "buildingId": "b1", "roomId": "r1" }))
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["error"], "Payload validation failed.");
    let details = body["details"][0].as_str().unwrap();
    assert!(details.contains("timestamp"));
    assert!(details.contains("temperature"));
}

#[tokio::test]
async fn latest_with_no_data_is_not_found() {
    let app = test_app(fresh_db("latest_empty").await, vec!["eng"]).await;
    let (status, body) = app
        .get(
            "/temperature/latest?building=b1&roomId=r1",
            Some(&customer()),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["type"], "Not Found Error");
}

#[tokio::test]
async fn a_reading_is_ingested_then_read_back() {
    let app = test_app(fresh_db("readback").await, vec!["eng"]).await;
    app.ingest(temperature("r1", BASE_MS, 21.5)).await;

    let (status, body) = app
        .get(
            "/temperature/latest?building=b1&roomId=r1",
            Some(&customer()),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["value"], 21.5);
    assert_eq!(body["data"]["roomId"], "r1");
    assert_eq!(body["data"]["timestamp"], BASE_MS);
}

#[tokio::test]
async fn entire_building_returns_one_row_per_room() {
    let app = test_app(fresh_db("entire").await, vec!["eng"]).await;
    for (room, value) in [("r1", 21.0), ("r2", 19.0)] {
        app.ingest(temperature(room, BASE_MS, value)).await;
    }

    let (status, body) = app
        .get("/temperature/entireBuilding?building=b1", Some(&customer()))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn a_read_carries_the_same_flat_metric_fields_the_socket_event_does() {
    let app = test_app(fresh_db("read_shape").await, vec!["eng"]).await;
    app.ingest(
        json!({ "type": "airQuality", "buildingId": "b1", "roomId": "r1",
                "timestamp": BASE_MS, "pm25": 8.0, "co2": 700.0, "indoor_aqi": 42.5 }),
    )
    .await;

    let (status, body) = app
        .get(
            "/airQuality/latest?building=b1&roomId=r1",
            Some(&customer()),
        )
        .await;

    assert_eq!(status, StatusCode::OK);
    let data = &body["data"];
    assert_eq!(
        data["indoor_aqi"], 42.5,
        "the value field must be readable under its own name, not only as `value`"
    );
    assert_eq!(
        data["pm25"], 8.0,
        "every other measurement must survive the round trip at the top level"
    );
    assert_eq!(data["co2"], 700.0);
    assert_eq!(data["building"], "b1");
    assert_eq!(data["roomId"], "r1");
    assert_eq!(data["timestamp"], BASE_MS);
    assert_eq!(data["value"], 42.5);
    assert!(
        data.get("payload").is_none(),
        "a nested payload is the shape the dashboard cannot read"
    );

    let (_, body) = app
        .get("/airQuality/entireBuilding?building=b1", Some(&customer()))
        .await;
    assert_eq!(body["data"][0]["indoor_aqi"], 42.5);
}

#[tokio::test]
async fn a_custom_range_without_a_start_is_rejected() {
    let app = test_app(fresh_db("w8_missing").await, vec!["eng"]).await;
    let (status, body) = app
        .get(
            "/temperature/dashboard?building=b1&timeRange=custom",
            Some(&customer()),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("start"));
}

#[tokio::test]
async fn a_custom_range_with_an_explicit_start_and_end_works() {
    let app = test_app(fresh_db("w8_works").await, vec!["eng"]).await;
    app.ingest(temperature("r1", BASE_MS, 21.5)).await;

    let uri = format!(
        "/temperature/dashboard?building=b1&timeRange=custom&start={}&end={}",
        BASE_MS - 3_600_000,
        BASE_MS + 3_600_000
    );
    let (status, body) = app.get(&uri, Some(&customer())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"].as_array().unwrap().len(), 1);
    assert_eq!(body["data"][0]["value"], 21.5);
}

#[tokio::test]
async fn the_twin_clone_put_populates_rooms_and_max_temperature() {
    let app = test_app(fresh_db("w2").await, vec!["eng"]).await;

    let (status, _) = app
        .send_json(
            "PUT",
            "/thresholds/buildings/b1",
            Some(&staff()),
            json!({
                "name": "HQ",
                "rooms": [{ "id": "r1", "name": "Lobby" }, { "id": "r2", "name": "Lab" }],
                "maxTemperature": 26.5
            }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = app.get("/thresholds/buildings/b1", Some(&customer())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["buildingId"], "b1");
    assert_eq!(body["maxTemperature"], 26.5);
    assert_eq!(body["rooms"].as_array().unwrap().len(), 2);
    assert_eq!(body["rooms"][0]["id"], "r1");
}

#[tokio::test]
async fn a_people_count_room_threshold_is_readable_back() {
    let app = test_app(fresh_db("w1_api").await, vec!["eng"]).await;

    let (status, body) = app
        .send_json(
            "PATCH",
            "/thresholds/peopleCount/buildings/b1/rooms/r1",
            Some(&staff()),
            json!({ "maxPeople": 12 }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"]["maxPeople"], 12);

    app.send_json(
        "PATCH",
        "/thresholds/peopleCount/buildings/b1",
        Some(&staff()),
        json!({ "maxPeople": 50 }),
    )
    .await;

    let (_, building) = app
        .get("/thresholds/peopleCount/buildings/b1", Some(&customer()))
        .await;
    assert_eq!(building["data"]["maxPeople"], 50);

    app.ingest(
        json!({ "type": "peopleCount", "buildingId": "b1", "roomId": "r1",
                "timestamp": BASE_MS, "peopleCount": 20 }),
    )
    .await;

    let alerts = app.alerts.published.lock().unwrap();
    assert_eq!(alerts.len(), 1);
    assert_eq!(alerts[0].metric, "peopleCount");
    assert_eq!(alerts[0].threshold, 12.0);
}

#[tokio::test]
async fn a_bound_the_metric_does_not_declare_is_rejected() {
    let app = test_app(fresh_db("badbound").await, vec!["eng"]).await;
    let (status, _) = app
        .send_json(
            "PATCH",
            "/thresholds/peopleCount/buildings/b1",
            Some(&staff()),
            json!({ "maxTemp": 25.0 }),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn registering_a_sensor_returns_created_then_conflicts() {
    let app = test_app(fresh_db("registry").await, vec!["eng"]).await;
    let body = json!({ "sensorData": {
        "buildingId": "b1", "roomId": "r1", "sensorId": "s1", "sensorType": "temperature"
    }});

    let (status, response) = app
        .send_json("POST", "/sensor", Some(&staff()), body.clone())
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(response["type"], "temperature");

    let (status, _) = app.send_json("POST", "/sensor", Some(&staff()), body).await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn registering_a_sensor_without_sensor_data_is_rejected() {
    let app = test_app(fresh_db("w14").await, vec!["eng"]).await;
    let (status, body) = app
        .send_json("POST", "/sensor", Some(&staff()), json!({}))
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["message"].as_str().unwrap().contains("sensorData"));
}

#[tokio::test]
async fn sensors_are_listed_with_the_actions_their_driver_supports() {
    let pool = fresh_db("capabilities").await;
    seed_building(&pool, "b1", &["r1"]).await;
    let app = test_app(pool, vec!["eng"]).await;

    app.send_json(
        "POST",
        "/sensor",
        Some(&staff()),
        json!({ "sensorData": {
            "buildingId": "b1", "roomId": "r1", "sensorId": "s1", "sensorType": "temperature",
            "driver": "tp-simulator", "endpoint": "http://device.local"
        }}),
    )
    .await;
    app.send_json(
        "POST",
        "/sensor",
        Some(&staff()),
        json!({ "sensorData": {
            "buildingId": "b1", "roomId": "r1", "sensorId": "s2", "sensorType": "peopleCount"
        }}),
    )
    .await;

    let (status, body) = app
        .get("/sensors/buildings/b1/rooms/r1", Some(&customer()))
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["data"][0]["sensorId"], "s1");
    assert_eq!(body["data"][0]["actions"], json!(["increase", "setTarget"]));
    assert_eq!(body["data"][1]["actions"], json!([]));
}

#[tokio::test]
async fn the_contract_advertises_metrics_and_their_actions() {
    let app = test_app(fresh_db("contracts").await, vec!["eng"]).await;
    let (status, body) = app.get("/contracts", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["service"], "telemetry-service");

    let metrics = body["metrics"].as_array().unwrap();
    assert_eq!(metrics.len(), 3);
    let temperature = metrics
        .iter()
        .find(|metric| metric["metricKey"] == "temperature")
        .unwrap();
    assert_eq!(temperature["unit"], "C");
    assert_eq!(temperature["actions"].as_array().unwrap().len(), 3);
    assert_eq!(temperature["actions"][0]["name"], "setTarget");
    assert_eq!(temperature["actions"][0]["parameters"][0]["name"], "target");

    let people = metrics
        .iter()
        .find(|metric| metric["metricKey"] == "peopleCount")
        .unwrap();
    assert_eq!(people["actions"], json!([]));
}

#[tokio::test]
async fn the_catalog_deserialises_into_the_shape_contracts_service_parses() {
    let app = test_app(fresh_db("contracts_seam").await, vec!["eng"]).await;
    let (status, body) = app.get("/contracts", None).await;
    assert_eq!(status, StatusCode::OK);

    let discovered: MetricsDiscoveryResponse = serde_json::from_value(body).unwrap();
    let MetricsDiscoveryResponse::ServiceContract(contract) = discovered else {
        panic!("telemetry-service advertises a service-shaped catalog");
    };
    assert_eq!(contract.service, "telemetry-service");
    assert!(
        contract
            .metrics
            .iter()
            .any(|metric| metric.metric_key == "temperature")
    );
    assert!(
        contract
            .metrics
            .iter()
            .flat_map(|metric| &metric.fields)
            .any(|field| field.name == "buildingId")
    );
}

#[tokio::test]
async fn health_answers_without_credentials() {
    let app = test_app(fresh_db("health").await, vec!["eng"]).await;
    let response = app
        .send(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn metrics_are_exposed_and_count_a_matched_route() {
    let app = test_app(fresh_db("metrics").await, vec!["eng"]).await;
    app.ingest(temperature("r1", BASE_MS, 21.5)).await;

    let response = app
        .send(
            Request::builder()
                .uri("/metrics")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(response.status(), StatusCode::OK);

    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let text = String::from_utf8(bytes.to_vec()).unwrap();
    assert!(text.contains(r#"telemetry_http_requests_total{method="POST",route="/ingest""#));
    assert!(text.contains(r#"telemetry_ingest_total{metric="temperature",outcome="accepted"}"#));
    assert!(text.contains("telemetry_db_pool_connections"));
    assert!(!text.contains(r#"route="/metrics""#));
}

#[tokio::test]
async fn ingest_without_a_type_is_rejected() {
    let app = test_app(fresh_db("ingest_notype").await, vec!["eng"]).await;
    let (status, _) = app
        .ingest(json!({ "buildingId": "b1", "roomId": "r1", "timestamp": BASE_MS }))
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn the_type_field_is_not_stored_as_a_payload_extra() {
    let app = test_app(fresh_db("ingest_typestrip").await, vec!["eng"]).await;
    app.ingest(temperature("r1", BASE_MS, 21.5)).await;

    let payload: serde_json::Value = sqlx::query_scalar("select payload from readings")
        .fetch_one(&app.pool)
        .await
        .unwrap();
    assert_eq!(payload, json!({}));
}
