// Every room-level mutation: PATCH (update one room), POST (create one room),
// DELETE (remove one room), PUT (replace the whole rooms array).

use axum::http::StatusCode;
use serde_json::json;

use crate::support::fixtures::{editor_token, mock_building, token};
use crate::support::http_client::send as request;
use crate::support::registration::{register, register_building, register_building_with_two_rooms};
use crate::support::test_app::app;

// ── PATCH /building/:buildingId/room/:roomId ────────────────────────────────

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
