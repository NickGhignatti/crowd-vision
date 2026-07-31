// IDOR protection: an authenticated caller from one domain must never see or
// affect another domain's data, even by guessing/enumerating the URL.

use axum::http::StatusCode;
use serde_json::json;

use crate::support::fixtures::{mock_building, token};
use crate::support::http_client::send as request;
use crate::support::registration::register;
use crate::support::test_app::app;

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
