// The room set is written once, by the upload, and never afterwards: no
// room-level write route exists. These tests pin both halves of that —
// the geometry an upload carries survives the round trip, and the routes
// the old editor used are gone.

use axum::http::StatusCode;
use serde_json::json;

use crate::support::fixtures::{editor_token, token};
use crate::support::http_client::send as request;
use crate::support::registration::register;
use crate::support::test_app::app;

#[tokio::test]
async fn upload_geometry_survives_the_round_trip() {
    let app = app().await;
    let building_id = register(
        &app,
        json!({
            "name": "Engineering Block",
            "domains": ["test-domain"],
            "rooms": [{
                "id": "Room-101",
                "name": "Room 101",
                "capacity": 50,
                "position": { "x": 5, "y": 0, "z": -2 },
                "dimensions": { "width": 4, "height": 3, "depth": 6 },
                "color": "#ff0000"
            }]
        }),
    )
    .await;

    let res = request(
        app,
        "GET",
        &format!("/building/{building_id}"),
        Some(&token()),
        None,
    )
    .await;

    assert_eq!(res.status, StatusCode::OK);
    let room = &res.body["rooms"][0];
    assert_eq!(room["name"], "Room 101");
    assert_eq!(room["capacity"].as_f64(), Some(50.0));
    assert_eq!(room["color"], "#ff0000");
    assert_eq!(room["position"]["x"].as_f64(), Some(5.0));
    assert_eq!(room["position"]["z"].as_f64(), Some(-2.0));
    assert_eq!(room["dimensions"]["width"].as_f64(), Some(4.0));
    assert_eq!(room["dimensions"]["height"].as_f64(), Some(3.0));
    assert_eq!(room["dimensions"]["depth"].as_f64(), Some(6.0));
}

// An editing role is deliberately not enough: the route itself is gone, so
// even a caller who *could* have edited before gets nothing to call.
#[tokio::test]
async fn no_room_write_route_is_routable() {
    let app = app().await;
    let building_id = register(
        &app,
        json!({
            "name": "Engineering Block",
            "domains": ["test-domain"],
            "rooms": [{
                "id": "Room-101",
                "name": "Room 101",
                "capacity": 20,
                "position": { "x": 0, "y": 0, "z": 0 },
                "dimensions": { "width": 10, "height": 10, "depth": 10 }
            }]
        }),
    )
    .await;

    let body = json!({ "capacity": 99 });
    let cases = [
        ("PATCH", format!("/building/{building_id}/room/Room-101")),
        ("DELETE", format!("/building/{building_id}/room/Room-101")),
        ("POST", format!("/building/{building_id}/room")),
        ("PUT", format!("/building/{building_id}/rooms")),
    ];

    for (method, path) in cases {
        let res = request(
            app.clone(),
            method,
            &path,
            Some(&editor_token()),
            Some(body.clone()),
        )
        .await;
        assert_eq!(
            res.status,
            StatusCode::NOT_FOUND,
            "{method} {path} must not be routable"
        );
    }
}
