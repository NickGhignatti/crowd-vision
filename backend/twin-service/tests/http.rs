use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
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
use twin_service::service::buildings::Buildings;
use twin_service::service::provisioning::Provisioning;
use twin_service::state::AppState;

async fn app() -> Router {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let db_name = format!("twin_service_http_test_{}", Uuid::new_v4().simple());
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

    let provisioning = Arc::new(Provisioning::new(store.clone(), queue, downstream.clone()));
    worker::spawn(provisioning.clone());

    build_router(AppState {
        buildings: Arc::new(Buildings::new(store, downstream)),
        provisioning,
        rate_limiter: RateLimiter::new(false),
    })
}

fn claims_header(payload: Value) -> String {
    BASE64.encode(payload.to_string())
}

// Member of "test-domain" only -- exercises both allowed and denied domain-scoped routes.
fn token() -> String {
    claims_header(json!({
        "sub": "u1",
        "accountName": "tester",
        "memberships": [{ "domain": "test-domain", "role": "standard_customer" }]
    }))
}

// Holds an editing role ("business_admin") in "test-domain" only.
fn editor_token() -> String {
    claims_header(json!({
        "sub": "u2",
        "accountName": "editor",
        "memberships": [{ "domain": "test-domain", "role": "business_admin" }]
    }))
}

fn mock_building() -> Value {
    json!({
        "name": "Engineering Block",
        "domains": ["test-domain"],
        "rooms": [{
            "id": "Room-101",
            "name": "Room 101",
            "capacity": 20,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": { "width": 10, "height": 10, "depth": 10 },
            "color": "#ffffff"
        }]
    })
}

struct Res {
    status: StatusCode,
    body: Value,
}

async fn request(
    app: Router,
    method: &str,
    path: &str,
    auth: Option<&str>,
    body: Option<Value>,
) -> Res {
    let mut builder = Request::builder().method(method).uri(path);
    if let Some(token) = auth {
        builder = builder.header("x-gateway-claims", token);
    }
    let request = if let Some(b) = body {
        builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };

    let response = app.oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    Res { status, body }
}

// POST /register only accepts an upload now -- the twin appears when the worker
// gets to it, so anything that reads a building back has to wait on the handle.
async fn wait_until_ready(app: &Router, handle: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let res = request(
            app.clone(),
            "GET",
            &format!("/building/{handle}/status"),
            Some(&token()),
            None,
        )
        .await;
        if res.body["status"] == "ready" {
            return;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "upload {handle} never became ready, last status was {}",
            res.body["status"]
        );
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
}

async fn register(app: &Router, payload: Value) -> String {
    let res = request(
        app.clone(),
        "POST",
        "/register",
        Some(&token()),
        Some(payload),
    )
    .await;
    assert_eq!(res.status, StatusCode::ACCEPTED, "body was {}", res.body);
    let handle = res.body["buildingId"]
        .as_str()
        .expect("a tracking handle")
        .to_string();
    wait_until_ready(app, &handle).await;
    handle
}

// ── authentication ──────────────────────────────────────────────────────────

#[tokio::test]
async fn rejects_requests_without_a_token() {
    let res = request(
        app().await,
        "POST",
        "/register",
        None,
        Some(mock_building()),
    )
    .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn rejects_requests_with_a_malformed_claims_header() {
    let res = request(
        app().await,
        "GET",
        "/building/anything",
        Some("not-valid-base64-json"),
        None,
    )
    .await;
    assert_eq!(res.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn keeps_health_public() {
    let res = request(app().await, "GET", "/health/", None, None).await;
    assert_eq!(res.status, StatusCode::OK);
}

#[tokio::test]
async fn accepts_a_valid_claims_header() {
    let res = request(
        app().await,
        "GET",
        "/buildings/test-domain",
        Some(&token()),
        None,
    )
    .await;
    assert_eq!(res.status, StatusCode::OK);
}

// ── tenant scoping (IDOR protection) ────────────────────────────────────────

#[tokio::test]
async fn denies_get_buildings_domain_for_a_domain_the_caller_does_not_belong_to() {
    let res = request(
        app().await,
        "GET",
        "/buildings/someone-elses-domain",
        Some(&token()),
        None,
    )
    .await;
    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn drops_domains_the_caller_does_not_belong_to_from_counts() {
    let app = app().await;
    register(&app, mock_building()).await;

    let res = request(
        app,
        "POST",
        "/buildings/counts",
        Some(&token()),
        Some(json!({ "domains": ["test-domain", "someone-elses-domain"] })),
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["counts"]["test-domain"], 1);
    assert!(res.body["counts"].get("someone-elses-domain").is_none());
}

// ── POST /register ──────────────────────────────────────────────────────────

#[tokio::test]
async fn accepts_an_upload_and_returns_a_tracking_handle() {
    let res = request(
        app().await,
        "POST",
        "/register",
        Some(&token()),
        Some(mock_building()),
    )
    .await;

    assert_eq!(res.status, StatusCode::ACCEPTED);
    assert!(
        res.body["buildingId"]
            .as_str()
            .is_some_and(|s| !s.is_empty())
    );
}

#[tokio::test]
async fn an_accepted_upload_becomes_a_viewable_twin() {
    let app = app().await;
    let building_id = register(&app, mock_building()).await;

    let res = request(
        app,
        "GET",
        &format!("/building/{building_id}"),
        Some(&token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["name"], "Engineering Block");
    assert_eq!(res.body["rooms"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn reports_an_unknown_handle_as_not_found() {
    let res = request(
        app().await,
        "GET",
        "/building/no-such-handle/status",
        Some(&token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn generates_a_different_id_for_each_registration() {
    let app = app().await;
    let r1 = request(
        app.clone(),
        "POST",
        "/register",
        Some(&token()),
        Some(mock_building()),
    )
    .await;
    let r2 = request(
        app,
        "POST",
        "/register",
        Some(&token()),
        Some(mock_building()),
    )
    .await;

    assert_eq!(r1.status, StatusCode::ACCEPTED);
    assert_eq!(r2.status, StatusCode::ACCEPTED);
    assert_ne!(r1.body["buildingId"], r2.body["buildingId"]);
}

#[tokio::test]
async fn falls_back_to_building_as_name_when_name_is_omitted() {
    let mut payload = mock_building();
    payload.as_object_mut().unwrap().remove("name");

    let app = app().await;
    let building_id = register(&app, payload).await;

    let res = request(
        app,
        "GET",
        &format!("/building/{building_id}"),
        Some(&token()),
        None,
    )
    .await;
    assert_eq!(res.body["name"], "Building");
}

#[tokio::test]
async fn ignores_any_id_field_sent_by_the_client() {
    let mut payload = mock_building();
    payload
        .as_object_mut()
        .unwrap()
        .insert("id".to_string(), json!("client-chosen-id"));

    let res = request(
        app().await,
        "POST",
        "/register",
        Some(&token()),
        Some(payload),
    )
    .await;

    assert_eq!(res.status, StatusCode::ACCEPTED);
    assert_ne!(res.body["buildingId"], "client-chosen-id");
}

// ── GET /building/:id ────────────────────────────────────────────────────────

#[tokio::test]
async fn retrieves_a_building_by_its_auto_generated_id() {
    let app = app().await;
    let building_id = register(&app, mock_building()).await;

    let res = request(
        app,
        "GET",
        &format!("/building/{building_id}"),
        Some(&token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["id"], building_id);
}

#[tokio::test]
async fn returns_404_if_building_not_found() {
    let res = request(
        app().await,
        "GET",
        "/building/NON_EXISTENT",
        Some(&token()),
        None,
    )
    .await;
    assert_eq!(res.status, StatusCode::NOT_FOUND);
}

// ── GET /buildings/:domain ──────────────────────────────────────────────────

#[tokio::test]
async fn retrieves_buildings_for_a_specific_domain() {
    let app = app().await;
    register(&app, mock_building()).await;
    register(&app, mock_building()).await;

    let res = request(app, "GET", "/buildings/test-domain", Some(&token()), None).await;

    assert_eq!(res.status, StatusCode::OK);
    assert!(res.body.as_array().unwrap().len() >= 2);
}

#[tokio::test]
async fn returns_an_empty_list_if_no_buildings_found_for_domain() {
    let res = request(
        app().await,
        "GET",
        "/buildings/test-domain",
        Some(&token()),
        None,
    )
    .await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body, json!([]));
}

// ── POST /buildings/counts ──────────────────────────────────────────────────

#[tokio::test]
async fn returns_building_counts_only_for_the_requested_domains() {
    let app = app().await;
    register(&app, mock_building()).await;
    register(&app, mock_building()).await;

    let res = request(
        app,
        "POST",
        "/buildings/counts",
        Some(&token()),
        Some(json!({ "domains": ["test-domain", "unknown-domain"] })),
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["counts"]["test-domain"], 2);
    assert!(res.body["counts"].get("unknown-domain").is_none());
}

#[tokio::test]
async fn returns_an_empty_map_for_an_empty_request() {
    let res = request(
        app().await,
        "POST",
        "/buildings/counts",
        Some(&token()),
        Some(json!({ "domains": [] })),
    )
    .await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["counts"], json!({}));
}

#[tokio::test]
async fn rejects_a_non_array_domains_payload() {
    let res = request(
        app().await,
        "POST",
        "/buildings/counts",
        Some(&token()),
        Some(json!({ "domains": "not-an-array" })),
    )
    .await;
    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn rejects_an_oversized_domains_payload() {
    let domains: Vec<String> = (0..501).map(|i| format!("d-{i}")).collect();
    let res = request(
        app().await,
        "POST",
        "/buildings/counts",
        Some(&token()),
        Some(json!({ "domains": domains })),
    )
    .await;
    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

// ── PATCH /building/:buildingId/room/:roomId ────────────────────────────────

async fn register_building(app: Router) -> String {
    register(&app, mock_building()).await
}

#[tokio::test]
async fn updates_room_details() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&editor_token()),
        Some(json!({ "capacity": 50, "color": "#ff0000", "name": "Physics Lab" })),
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["capacity"].as_f64(), Some(50.0));
    assert_eq!(res.body["color"], "#ff0000");
    assert_eq!(res.body["name"], "Physics Lab");
}

#[tokio::test]
async fn persists_position_and_dimensions() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&editor_token()),
        Some(json!({
            "position": { "x": 5, "y": 0, "z": -2 },
            "dimensions": { "width": 4, "height": 3, "depth": 6 }
        })),
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["position"]["x"].as_f64(), Some(5.0));
    assert_eq!(res.body["position"]["y"].as_f64(), Some(0.0));
    assert_eq!(res.body["position"]["z"].as_f64(), Some(-2.0));
    assert_eq!(res.body["dimensions"]["width"].as_f64(), Some(4.0));
    assert_eq!(res.body["dimensions"]["height"].as_f64(), Some(3.0));
    assert_eq!(res.body["dimensions"]["depth"].as_f64(), Some(6.0));
}

#[tokio::test]
async fn rejects_non_positive_dimensions_on_room_update() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&editor_token()),
        Some(json!({ "dimensions": { "width": 0, "height": 3, "depth": 6 } })),
    )
    .await;

    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn rejects_non_finite_position_coordinates() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    // Mirrors JSON.stringify(NaN) -> null on the JS side.
    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&editor_token()),
        Some(json!({ "position": { "x": null, "y": 0, "z": 0 } })),
    )
    .await;

    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn room_update_returns_404_if_building_not_found() {
    let res = request(
        app().await,
        "PATCH",
        "/building/FAKE_BUILDING/room/Room-101",
        Some(&editor_token()),
        Some(json!({ "capacity": 50 })),
    )
    .await;
    assert_eq!(res.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn room_update_returns_404_if_room_not_found() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/FAKE_ROOM"),
        Some(&editor_token()),
        Some(json!({ "capacity": 50 })),
    )
    .await;

    assert_eq!(res.status, StatusCode::NOT_FOUND);
    assert!(res.body["type"].is_string());
    assert!(
        res.body["message"]
            .as_str()
            .unwrap()
            .to_lowercase()
            .contains("room")
    );
}

#[tokio::test]
async fn room_update_denies_a_member_without_an_editing_role() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&token()),
        Some(json!({ "capacity": 50 })),
    )
    .await;

    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn room_update_denies_an_editor_whose_role_is_in_a_different_domain() {
    let app = app().await;
    let mut payload = mock_building();
    payload
        .as_object_mut()
        .unwrap()
        .insert("domains".to_string(), json!(["someone-elses-domain"]));
    let building_id = register(&app, payload).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&editor_token()),
        Some(json!({ "capacity": 50 })),
    )
    .await;

    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

// ── POST /building/:buildingId/room ─────────────────────────────────────────

#[tokio::test]
async fn creates_a_room_with_a_server_assigned_id() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "POST",
        &format!("/building/{building_id}/room"),
        Some(&editor_token()),
        Some(json!({
            "name": "Room 202",
            "capacity": 15,
            "position": { "x": 1, "y": 0, "z": 1 },
            "dimensions": { "width": 3, "height": 3, "depth": 3 },
            "color": "#00ff00"
        })),
    )
    .await;

    assert_eq!(res.status, StatusCode::CREATED);
    assert!(res.body["id"].as_str().is_some_and(|s| !s.is_empty()));
    assert_eq!(res.body["name"], "Room 202");
}

#[tokio::test]
async fn create_room_rejects_invalid_geometry() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "POST",
        &format!("/building/{building_id}/room"),
        Some(&editor_token()),
        Some(json!({
            "name": "Bad room",
            "capacity": 1,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": { "width": -1, "height": 1, "depth": 1 }
        })),
    )
    .await;

    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_room_denies_a_member_without_an_editing_role() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "POST",
        &format!("/building/{building_id}/room"),
        Some(&token()),
        Some(json!({
            "name": "Room X",
            "capacity": 1,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": { "width": 1, "height": 1, "depth": 1 }
        })),
    )
    .await;

    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

// ── DELETE /building/:buildingId/room/:roomId ───────────────────────────────

async fn register_building_with_two_rooms(app: Router) -> String {
    let mut payload = mock_building();
    let rooms = payload["rooms"].as_array().unwrap().clone();
    let mut rooms = rooms;
    rooms.push(json!({
        "id": "Room-102",
        "name": "Room 102",
        "capacity": 10,
        "position": { "x": 10, "y": 0, "z": 0 },
        "dimensions": { "width": 5, "height": 5, "depth": 5 }
    }));
    payload
        .as_object_mut()
        .unwrap()
        .insert("rooms".to_string(), json!(rooms));
    register(&app, payload).await
}

#[tokio::test]
async fn deletes_a_room() {
    let app = app().await;
    let building_id = register_building_with_two_rooms(app.clone()).await;

    let res = request(
        app,
        "DELETE",
        &format!("/building/{building_id}/room/Room-102"),
        Some(&editor_token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn blocks_deleting_the_last_room() {
    let app = app().await;
    let building_id = register_building_with_two_rooms(app.clone()).await;

    request(
        app.clone(),
        "DELETE",
        &format!("/building/{building_id}/room/Room-102"),
        Some(&editor_token()),
        None,
    )
    .await;

    let res = request(
        app,
        "DELETE",
        &format!("/building/{building_id}/room/Room-101"),
        Some(&editor_token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn delete_room_returns_404_for_an_unknown_room() {
    let app = app().await;
    let building_id = register_building_with_two_rooms(app.clone()).await;

    let res = request(
        app,
        "DELETE",
        &format!("/building/{building_id}/room/NOPE"),
        Some(&editor_token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn delete_room_denies_a_member_without_an_editing_role() {
    let app = app().await;
    let building_id = register_building_with_two_rooms(app.clone()).await;

    let res = request(
        app,
        "DELETE",
        &format!("/building/{building_id}/room/Room-102"),
        Some(&token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

// ── PUT /building/:buildingId/rooms ─────────────────────────────────────────

#[tokio::test]
async fn atomically_replaces_the_rooms_array() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let rooms = json!([
        {
            "id": "Room-101",
            "name": "Room 101 (moved)",
            "capacity": 20,
            "position": { "x": 3, "y": 0, "z": 3 },
            "dimensions": { "width": 10, "height": 10, "depth": 10 }
        },
        {
            "id": "Room-new",
            "name": "Brand new room",
            "capacity": 5,
            "position": { "x": 20, "y": 0, "z": 0 },
            "dimensions": { "width": 4, "height": 4, "depth": 4 }
        }
    ]);

    let res = request(
        app,
        "PUT",
        &format!("/building/{building_id}/rooms"),
        Some(&editor_token()),
        Some(json!({ "rooms": rooms })),
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["rooms"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn rejects_the_whole_request_if_any_room_is_invalid() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let rooms = json!([
        {
            "id": "Room-101",
            "name": "Room 101",
            "capacity": 20,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": { "width": 10, "height": 10, "depth": 10 }
        },
        {
            "id": "Room-bad",
            "name": "Bad room",
            "capacity": 1,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": { "width": -1, "height": 1, "depth": 1 }
        }
    ]);

    let res = request(
        app.clone(),
        "PUT",
        &format!("/building/{building_id}/rooms"),
        Some(&editor_token()),
        Some(json!({ "rooms": rooms })),
    )
    .await;
    assert_eq!(res.status, StatusCode::BAD_REQUEST);

    let get = request(
        app,
        "GET",
        &format!("/building/{building_id}"),
        Some(&token()),
        None,
    )
    .await;
    assert_eq!(get.body["rooms"].as_array().unwrap().len(), 1);
    assert_eq!(get.body["rooms"][0]["id"], "Room-101");
}

#[tokio::test]
async fn rejects_duplicate_room_ids() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let rooms = json!([
        {
            "id": "Room-101",
            "name": "A",
            "capacity": 1,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": { "width": 1, "height": 1, "depth": 1 }
        },
        {
            "id": "Room-101",
            "name": "B",
            "capacity": 1,
            "position": { "x": 1, "y": 0, "z": 0 },
            "dimensions": { "width": 1, "height": 1, "depth": 1 }
        }
    ]);

    let res = request(
        app,
        "PUT",
        &format!("/building/{building_id}/rooms"),
        Some(&editor_token()),
        Some(json!({ "rooms": rooms })),
    )
    .await;

    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn rejects_an_empty_rooms_array() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PUT",
        &format!("/building/{building_id}/rooms"),
        Some(&editor_token()),
        Some(json!({ "rooms": [] })),
    )
    .await;

    assert_eq!(res.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn replace_rooms_denies_a_member_without_an_editing_role() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PUT",
        &format!("/building/{building_id}/rooms"),
        Some(&token()),
        Some(json!({ "rooms": mock_building()["rooms"] })),
    )
    .await;

    assert_eq!(res.status, StatusCode::FORBIDDEN);
}

// ── PATCH /building/:buildingId ─────────────────────────────────────────────

#[tokio::test]
async fn updates_building_name() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}"),
        Some(&editor_token()),
        Some(json!({ "name": "New Building Name" })),
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["name"], "New Building Name");
}

#[tokio::test]
async fn update_building_denies_a_member_without_an_editing_role() {
    let app = app().await;
    let building_id = register_building(app.clone()).await;

    let res = request(
        app,
        "PATCH",
        &format!("/building/{building_id}"),
        Some(&token()),
        Some(json!({ "name": "New Building Name" })),
    )
    .await;

    assert_eq!(res.status, StatusCode::FORBIDDEN);
}
