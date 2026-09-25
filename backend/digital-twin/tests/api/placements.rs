// Where a sensor physically sits. Telemetry owns the sensor itself and never sees
// coordinates; these routes hold the point, keyed by telemetry's own sensor id.

use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::support::fixtures::{editor_token, member_of, token};
use crate::support::http_client::send as request;
use crate::support::registration::register_building;
use crate::support::test_app::app;

fn placement(sensor_id: &str, x: f64) -> Value {
    json!({ "sensorId": sensor_id, "position": { "x": x, "y": 0.0, "z": -3.0 } })
}

async fn saved(router: &axum::Router, building_id: &str, body: Value, auth: &str) -> StatusCode {
    request(
        router.clone(),
        "PUT",
        &format!("/building/{building_id}/placements"),
        Some(auth),
        Some(body),
    )
    .await
    .status
}

async fn listed(router: &axum::Router, building_id: &str, auth: &str) -> (StatusCode, Value) {
    let res = request(
        router.clone(),
        "GET",
        &format!("/building/{building_id}/placements"),
        Some(auth),
        None,
    )
    .await;
    (res.status, res.body)
}

#[tokio::test]
async fn placements_are_saved_and_read_back_in_sensor_id_order() {
    let router = app().await;
    let building_id = register_building(router.clone()).await;

    let status = saved(
        &router,
        &building_id,
        json!({ "upsert": [placement("s2", 2.0), placement("s1", 1.0)] }),
        &editor_token(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, body) = listed(&router, &building_id, &token()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([placement("s1", 1.0), placement("s2", 2.0)]));
}

#[tokio::test]
async fn one_batch_moves_a_placement_and_removes_another() {
    let router = app().await;
    let building_id = register_building(router.clone()).await;
    saved(
        &router,
        &building_id,
        json!({ "upsert": [placement("s1", 1.0), placement("s2", 2.0)] }),
        &editor_token(),
    )
    .await;

    let status = saved(
        &router,
        &building_id,
        json!({ "upsert": [placement("s1", 9.5)], "delete": ["s2"] }),
        &editor_token(),
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, body) = listed(&router, &building_id, &token()).await;
    assert_eq!(body, json!([placement("s1", 9.5)]));
}

#[tokio::test]
async fn an_unplaced_building_lists_nothing() {
    let router = app().await;
    let building_id = register_building(router.clone()).await;

    let (status, body) = listed(&router, &building_id, &token()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn saving_needs_an_editing_role_in_the_buildings_domains() {
    let router = app().await;
    let building_id = register_building(router.clone()).await;

    for auth in [token(), member_of("other-domain")] {
        let status = saved(
            &router,
            &building_id,
            json!({ "upsert": [placement("s1", 1.0)] }),
            &auth,
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    let (_, body) = listed(&router, &building_id, &token()).await;
    assert_eq!(body, json!([]));
}

#[tokio::test]
async fn reading_needs_membership_in_the_buildings_domains() {
    let router = app().await;
    let building_id = register_building(router.clone()).await;

    let (status, _) = listed(&router, &building_id, &member_of("other-domain")).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn an_unknown_building_is_not_found() {
    let router = app().await;

    let status = saved(
        &router,
        "missing",
        json!({ "upsert": [placement("s1", 1.0)] }),
        &editor_token(),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = listed(&router, "missing", &token()).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_batch_the_domain_refuses_is_rejected() {
    let router = app().await;
    let building_id = register_building(router.clone()).await;

    let bad = [
        json!({ "upsert": [{ "sensorId": "s1", "position": { "x": 1.0, "y": 0.0 } }] }),
        json!({ "upsert": [placement("s1", 1.0), placement("s1", 2.0)] }),
        json!({ "upsert": [placement("with space", 1.0)] }),
        json!({ "delete": ["  "] }),
    ];
    for body in bad {
        let status = saved(&router, &building_id, body.clone(), &editor_token()).await;
        assert!(
            status == StatusCode::BAD_REQUEST || status == StatusCode::UNPROCESSABLE_ENTITY,
            "{body} gave {status}"
        );
    }

    let (_, listed) = listed(&router, &building_id, &token()).await;
    assert_eq!(listed, json!([]));
}
