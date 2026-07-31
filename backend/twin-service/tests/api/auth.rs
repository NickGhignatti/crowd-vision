use axum::http::StatusCode;

use crate::support::fixtures::{mock_building, token};
use crate::support::http_client::send as request;
use crate::support::test_app::app;

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
