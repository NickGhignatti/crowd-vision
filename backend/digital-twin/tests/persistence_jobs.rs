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

async fn open_queue(collection_name: &str) -> MongoUploadQueue {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let opts = ClientOptions::parse(&uri).await.unwrap();
    let client = mongodb::Client::with_options(opts).unwrap();
    let buildings = client
        .database("digital_twin_test")
        .collection::<Building>("buildings_for_jobs_test");
    MongoUploadQueue::with_collection_name(&buildings, collection_name)
        .await
        .unwrap()
}

async fn test_queue() -> (MongoUploadQueue, String) {
    let collection_name = format!("pending_uploads_{}", Uuid::new_v4());
    (open_queue(&collection_name).await, collection_name)
}

async fn raw_collection(collection_name: &str) -> mongodb::Collection<mongodb::bson::Document> {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    mongodb::Client::with_uri_str(&uri)
        .await
        .unwrap()
        .database("digital_twin_test")
        .collection(collection_name)
}

async fn finished_at(collection_name: &str, id: &str) -> Option<mongodb::bson::Bson> {
    raw_collection(collection_name)
        .await
        .find_one(doc! { "id": id })
        .await
        .unwrap()
        .expect("job exists")
        .get("finished_at")
        .cloned()
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

async fn index_keys(collection_name: &str) -> Vec<(mongodb::bson::Document, bool)> {
    let mut cursor = raw_collection(collection_name)
        .await
        .list_indexes()
        .await
        .unwrap();
    let mut keys = Vec::new();
    while cursor.advance().await.unwrap() {
        let index = cursor.deserialize_current().unwrap();
        let unique = index.options.and_then(|o| o.unique).unwrap_or(false);
        keys.push((index.keys, unique));
    }
    keys
}

// Every status poll, claim and resolve filters this collection; without these indexes each one
// reads every queued upload, and every upload carries its whole building.
#[tokio::test]
async fn the_queue_indexes_what_status_claim_and_resolve_look_up() {
    let (queue, collection_name) = test_queue().await;
    enqueued(&queue).await;

    let keys = index_keys(&collection_name).await;
    assert!(
        keys.iter()
            .any(|(k, unique)| *k == doc! { "id": 1 } && *unique),
        "no unique index on id; indexes were {keys:?}"
    );
    assert!(
        keys.iter()
            .any(|(k, _)| k.keys().next().map(String::as_str) == Some("status")),
        "no index led by status for claim; indexes were {keys:?}"
    );
}

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

// The browser learns an upload finished by polling its status, so the record must outlive that
// wait (30s) before it goes; an hour leaves wide margin.
#[tokio::test]
async fn finished_uploads_expire_an_hour_after_they_finish() {
    let (queue, collection_name) = test_queue().await;
    enqueued(&queue).await;

    let mut cursor = raw_collection(&collection_name)
        .await
        .list_indexes()
        .await
        .unwrap();
    let mut expiry = None;
    while cursor.advance().await.unwrap() {
        let index = cursor.deserialize_current().unwrap();
        if index.keys == doc! { "finished_at": 1 } {
            expiry = index.options.and_then(|o| o.expire_after);
        }
    }
    assert_eq!(expiry, Some(Duration::from_secs(3600)));
}

#[tokio::test]
async fn resolving_records_when_the_upload_finished() {
    let (queue, collection_name) = test_queue().await;
    let ready = enqueued(&queue).await;
    let failed = enqueued(&queue).await;
    let pending = enqueued(&queue).await;

    queue.mark_ready(&ready).await.unwrap();
    queue.mark_failed(&failed, "boom").await.unwrap();

    assert!(matches!(
        finished_at(&collection_name, &ready).await,
        Some(mongodb::bson::Bson::DateTime(_))
    ));
    assert!(matches!(
        finished_at(&collection_name, &failed).await,
        Some(mongodb::bson::Bson::DateTime(_))
    ));
    // Pending records store finished_at as null, like leased_until; TTL only removes dates.
    assert!(!matches!(
        finished_at(&collection_name, &pending).await,
        Some(mongodb::bson::Bson::DateTime(_))
    ));
}

// Records finished before expiry existed carry no finish time, and a TTL index never removes
// a record without its field.
#[tokio::test]
async fn uploads_finished_before_expiry_existed_are_given_a_finish_time() {
    let (queue, collection_name) = test_queue().await;
    let id = enqueued(&queue).await;
    queue.mark_ready(&id).await.unwrap();
    raw_collection(&collection_name)
        .await
        .update_one(doc! { "id": &id }, doc! { "$unset": { "finished_at": "" } })
        .await
        .unwrap();

    open_queue(&collection_name).await;

    assert!(matches!(
        finished_at(&collection_name, &id).await,
        Some(mongodb::bson::Bson::DateTime(_))
    ));
}

#[tokio::test]
async fn a_completion_arriving_after_the_record_expired_is_a_no_op() {
    let (queue, collection_name) = test_queue().await;
    let id = enqueued(&queue).await;
    queue.mark_ready(&id).await.unwrap();
    raw_collection(&collection_name)
        .await
        .delete_one(doc! { "id": &id })
        .await
        .unwrap();

    assert!(queue.mark_ready(&id).await.unwrap().is_none());
    assert!(queue.status(&id).await.unwrap().is_none());
}
