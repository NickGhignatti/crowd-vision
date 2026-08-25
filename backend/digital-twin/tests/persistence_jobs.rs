use std::time::Duration;

use mongodb::bson::doc;
use mongodb::options::ClientOptions;
use uuid::Uuid;

use digital_twin::adapters::driven::persistence::jobs::MongoUploadQueue;
use digital_twin::domain::{AcceptedUpload, Building, Coordinates, Dimensions, Room, UploadStatus};
use digital_twin::service::ports::UploadQueue;

fn dummy_building(id: &str) -> Building {
    Building {
        id: id.to_string(),
        name: "Test Building".to_string(),
        rooms: vec![Room {
            id: "r1".to_string(),
            name: "r1".to_string(),
            capacity: 10.0,
            position: Coordinates {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            dimensions: Dimensions {
                width: 1.0,
                height: 1.0,
                depth: 1.0,
            },
            color: None,
        }],
        domains: vec!["eng".to_string()],
    }
}

async fn test_queue() -> (MongoUploadQueue, String) {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let opts = ClientOptions::parse(&uri).await.unwrap();
    let client = mongodb::Client::with_options(opts).unwrap();
    let collection_name = format!("pending_uploads_{}", Uuid::new_v4());
    let buildings = client
        .database("digital_twin_test")
        .collection::<Building>("buildings_for_jobs_test");
    let queue = MongoUploadQueue::with_collection_name(&buildings, &collection_name);
    (queue, collection_name)
}

async fn enqueued(queue: &MongoUploadQueue) -> String {
    let id = Uuid::new_v4().to_string();
    let upload = AcceptedUpload {
        id: id.clone(),
        building: dummy_building(&id),
        claims: "tok".to_string(),
    };
    queue.enqueue(&upload).await.unwrap();
    id
}

const LEASE: Duration = Duration::from_secs(30);

#[tokio::test]
async fn an_enqueued_upload_is_pending() {
    let (queue, _) = test_queue().await;
    let id = enqueued(&queue).await;

    assert_eq!(
        queue.status(&id).await.unwrap(),
        Some(UploadStatus::Pending)
    );
}

#[tokio::test]
async fn claiming_returns_the_enqueued_upload_with_its_payload() {
    let (queue, _) = test_queue().await;
    let id = enqueued(&queue).await;

    let claimed = queue
        .claim(LEASE)
        .await
        .unwrap()
        .expect("a claimable upload");
    assert_eq!(claimed.id, id);
    assert_eq!(claimed.building.id, id);
    assert_eq!(claimed.claims, "tok");
}

#[tokio::test]
async fn a_leased_upload_is_not_handed_to_a_second_worker() {
    let (queue, _) = test_queue().await;
    enqueued(&queue).await;

    queue.claim(LEASE).await.unwrap().expect("first worker");
    let second = queue.claim(LEASE).await.unwrap();

    assert!(
        second.is_none(),
        "a held upload must not be delivered twice"
    );
}

#[tokio::test]
async fn an_upload_whose_lease_expired_is_redelivered() {
    let (queue, _) = test_queue().await;
    let id = enqueued(&queue).await;

    queue
        .claim(Duration::ZERO)
        .await
        .unwrap()
        .expect("first worker");
    tokio::time::sleep(Duration::from_millis(20)).await;

    let redelivered = queue.claim(LEASE).await.unwrap().expect("redelivery");
    assert_eq!(redelivered.id, id);
}

#[tokio::test]
async fn every_delivery_is_counted() {
    let (queue, collection_name) = test_queue().await;
    let id = enqueued(&queue).await;

    queue.claim(Duration::ZERO).await.unwrap().unwrap();
    queue.claim(Duration::ZERO).await.unwrap().unwrap();

    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let client = mongodb::Client::with_uri_str(&uri).await.unwrap();
    let raw = client
        .database("digital_twin_test")
        .collection::<mongodb::bson::Document>(&collection_name);
    let doc = raw
        .find_one(doc! { "id": { "$eq": &id } })
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        doc.get_i32("attempts").unwrap(),
        2,
        "the retry budget depends on this count"
    );
}

#[tokio::test]
async fn a_provisioned_upload_is_ready_and_no_longer_claimable() {
    let (queue, _) = test_queue().await;
    let id = enqueued(&queue).await;
    queue.claim(LEASE).await.unwrap().expect("claimable");

    queue.mark_ready(&id).await.unwrap();

    assert_eq!(queue.status(&id).await.unwrap(), Some(UploadStatus::Ready));
    assert!(queue.claim(Duration::ZERO).await.unwrap().is_none());
}

#[tokio::test]
async fn a_dead_lettered_upload_is_failed_and_no_longer_claimable() {
    let (queue, _) = test_queue().await;
    let id = enqueued(&queue).await;

    queue.mark_failed(&id, "downstream refused").await.unwrap();

    assert_eq!(queue.status(&id).await.unwrap(), Some(UploadStatus::Failed));
    assert!(queue.claim(Duration::ZERO).await.unwrap().is_none());
}

#[tokio::test]
async fn an_empty_queue_yields_nothing() {
    let (queue, _) = test_queue().await;

    assert!(queue.claim(LEASE).await.unwrap().is_none());
}

#[tokio::test]
async fn an_unknown_handle_has_no_status() {
    let (queue, _) = test_queue().await;

    assert_eq!(queue.status("nope").await.unwrap(), None);
}
