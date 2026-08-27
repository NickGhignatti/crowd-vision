//! MongoDB adapter, against a real MongoDB.
//!
//! Picked up by `scripts/test/rust-integration-tests.sh`, which runs `tests/*.rs`
//! and nothing else — the same runner every other Rust service uses. These moved
//! here from `src/infra/db.rs`, where they sat behind `#[ignore]` and ran nowhere:
//! CI started no Mongo for this service, nothing in the repo passes `--ignored`,
//! and the runner could not see in-module tests. All three had to be fixed for
//! the adapter to be covered at all.
//!
//! MONGO_URI selects the server (defaults to localhost:27017); CI sets it.

use dashboard::infra::db::{load_all, upsert_preference};
use dashboard::models::PreferenceDocument;
use mongodb::{Client, Collection, options::ClientOptions};

/// A collection in a dedicated test database, named per test so cases that run
/// concurrently in one binary cannot drop each other's documents.
async fn test_col(name: &str) -> Collection<PreferenceDocument> {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let opts = ClientOptions::parse(&uri).await.unwrap();
    let client = Client::with_options(opts).unwrap();
    let col = client
        .database("crowdvision_test")
        .collection::<PreferenceDocument>(name);
    col.drop().await.unwrap();
    col
}

#[tokio::test]
async fn upsert_then_load_returns_the_document() {
    let col = test_col("upsert_and_load").await;

    upsert_preference(&col, "building-1", &["roomName".to_string()])
        .await
        .unwrap();

    let all = load_all(&col).await.unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].building_id, "building-1");
    assert_eq!(all[0].allowed_columns, vec!["roomName"]);
}

/// Upsert, not insert: the unique index on building_id means a second write for
/// the same building must replace the first rather than fail or duplicate it.
#[tokio::test]
async fn upsert_replaces_the_existing_document_for_a_building() {
    let col = test_col("upsert_replaces").await;

    upsert_preference(&col, "building-1", &["roomName".to_string()])
        .await
        .unwrap();
    upsert_preference(&col, "building-1", &["co2".to_string(), "temp".to_string()])
        .await
        .unwrap();

    let all = load_all(&col).await.unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].allowed_columns, vec!["co2", "temp"]);
}

#[tokio::test]
async fn load_all_on_an_empty_collection_is_empty_not_an_error() {
    let col = test_col("load_empty").await;

    let all = load_all(&col).await.unwrap();

    assert!(all.is_empty());
}

/// Two buildings must not bleed into each other: load_all backs the in-memory
/// preference map the tunnel consults per tick, so a cross-building leak here
/// would forward one building's telemetry onto another's channel.
#[tokio::test]
async fn load_all_returns_every_building_separately() {
    let col = test_col("load_many").await;

    upsert_preference(&col, "building-a", &["temp".to_string()])
        .await
        .unwrap();
    upsert_preference(&col, "building-b", &["co2".to_string()])
        .await
        .unwrap();

    let mut all = load_all(&col).await.unwrap();
    all.sort_by(|a, b| a.building_id.cmp(&b.building_id));

    assert_eq!(all.len(), 2);
    assert_eq!(all[0].building_id, "building-a");
    assert_eq!(all[0].allowed_columns, vec!["temp"]);
    assert_eq!(all[1].building_id, "building-b");
    assert_eq!(all[1].allowed_columns, vec!["co2"]);
}
