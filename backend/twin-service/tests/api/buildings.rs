// GET /buildings/:domain and POST /buildings/counts — the building-collection
// level (listing/counting), as opposed to a single building or its rooms.

use axum::http::StatusCode;
use serde_json::json;

use crate::support::fixtures::{mock_building, token};
use crate::support::http_client::send as request;
use crate::support::registration::register;
use crate::support::test_app::app;

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
