use axum::Router;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::support::fixtures::{mock_building, token};
use crate::support::http_client::send;

/// The upload happens in the background queue, an HTTP test can't immediately ask
/// for the building after posting it. This function uses a loop to repeatedly hit
/// the /status endpoint until the "instant resolver" finishes the job, ensuring the
/// test doesn't fail due to a race condition.
pub async fn wait_until_ready(router: &Router, handle: &str) {
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    loop {
        let res = send(
            router.clone(),
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

pub async fn register(router: &Router, payload: Value) -> String {
    let res = send(
        router.clone(),
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
    wait_until_ready(router, &handle).await;
    handle
}

pub async fn register_building(router: Router) -> String {
    register(&router, mock_building()).await
}

pub async fn register_building_with_two_rooms(router: Router) -> String {
    let mut payload = mock_building();
    let mut rooms = payload["rooms"].as_array().unwrap().clone();
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
    register(&router, payload).await
}
