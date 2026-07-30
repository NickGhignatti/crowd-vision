use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use cucumber::{then, when};
use serde_json::Value;
use tower::ServiceExt;

use crate::support::fixtures::{admin_of, building_with_n_rooms};
use crate::support::world::{LoadRun, TwinWorld};

const AVAILABILITY_TIMEOUT: Duration = Duration::from_secs(15);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

fn p99(mut samples: Vec<Duration>) -> Duration {
    samples.sort();
    let idx = ((samples.len() as f64) * 0.99).ceil() as usize;
    samples[idx.saturating_sub(1).min(samples.len() - 1)]
}

async fn upload_and_wait_ready(
    router: axum::Router,
    domain: String,
    name: String,
    rooms: usize,
) -> (Duration, Duration) {
    let payload = building_with_n_rooms(&name, &domain, rooms);
    let request = Request::builder()
        .method("POST")
        .uri("/register")
        .header("x-gateway-claims", admin_of(&domain))
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(payload.to_string()))
        .unwrap();

    let start = Instant::now();
    let response = router.clone().oneshot(request).await.unwrap();
    let accept_latency = start.elapsed();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    let id = body["buildingId"].as_str().unwrap().to_string();

    let ack_at = Instant::now();
    loop {
        let status_request = Request::builder()
            .method("GET")
            .uri(format!("/building/{id}/status"))
            .header("x-gateway-claims", admin_of(&domain))
            .body(Body::empty())
            .unwrap();
        let response = router.clone().oneshot(status_request).await.unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        if body.get("status").and_then(Value::as_str) == Some("ready") {
            break;
        }
        assert!(
            ack_at.elapsed() < AVAILABILITY_TIMEOUT,
            "building {id} never became ready within {AVAILABILITY_TIMEOUT:?}"
        );
        tokio::time::sleep(POLL_INTERVAL).await;
    }

    (accept_latency, ack_at.elapsed())
}

#[when(
    expr = "{int} Domain Administrators each upload a valid description of a {int}-room building to organization {string}"
)]
async fn concurrent_uploads(world: &mut TwinWorld, admins: usize, rooms: usize, domain: String) {
    let tasks = (0..admins).map(|i| {
        tokio::spawn(upload_and_wait_ready(
            world.router.clone(),
            domain.clone(),
            format!("Load Building {i}"),
            rooms,
        ))
    });

    let results: Vec<(Duration, Duration)> = futures::future::join_all(tasks)
        .await
        .into_iter()
        .map(|r| r.expect("upload task panicked"))
        .collect();

    world.load_run = Some(LoadRun {
        accept_latencies: results.iter().map(|(a, _)| *a).collect(),
        available_latencies: results.iter().map(|(_, b)| *b).collect(),
    });
}

#[then(expr = "the 99th percentile of the request-to-acknowledgement time is at most {int} second")]
async fn p99_accept_at_most(world: &mut TwinWorld, secs: u64) {
    let run = world.load_run.as_ref().expect("no load run recorded");
    let observed = p99(run.accept_latencies.clone());
    assert!(
        observed <= Duration::from_secs(secs),
        "p99 accept latency {observed:?} exceeded {secs}s"
    );
}

#[then("every twin eventually becomes available for viewing and editing")]
async fn every_twin_available(world: &mut TwinWorld) {
    let run = world.load_run.as_ref().expect("no load run recorded");
    assert!(
        !run.available_latencies.is_empty(),
        "no uploads were tracked for availability"
    );
}

#[then(
    expr = "the 99th percentile of the acknowledgement-to-available time is at most {int} seconds"
)]
async fn p99_available_at_most(world: &mut TwinWorld, secs: u64) {
    let run = world.load_run.as_ref().expect("no load run recorded");
    let observed = p99(run.available_latencies.clone());
    assert!(
        observed <= Duration::from_secs(secs),
        "p99 available latency {observed:?} exceeded {secs}s"
    );
}
