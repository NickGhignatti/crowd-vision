// PATCH /building/:buildingId — building-level metadata (currently: name only).

use axum::http::StatusCode;
use serde_json::json;

use crate::support::fixtures::{editor_token, token};
use crate::support::http_client::send as request;
use crate::support::registration::register_building;
use crate::support::test_app::app;

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
