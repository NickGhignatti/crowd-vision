// POST /register and the single-building read endpoints it feeds
// (GET /building/:id, GET /building/:id/status).

use axum::http::StatusCode;
use serde_json::json;

use crate::support::fixtures::{mock_building, token};
use crate::support::http_client::send as request;
use crate::support::registration::register;
use crate::support::test_app::app;

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
