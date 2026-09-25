use mongodb::Collection;
use mongodb::bson::Document;
use mongodb::options::ClientOptions;
use uuid::Uuid;

use digital_twin::adapters::driven::persistence::placements::MongoPlacements;
use digital_twin::domain::{Coordinates, Placement, PlacementChanges};
use digital_twin::service::ports::PlacementStore;

async fn test_store() -> MongoPlacements {
    let uri =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let opts = ClientOptions::parse(&uri).await.unwrap();
    let client = mongodb::Client::with_options(opts).unwrap();
    let col: Collection<Document> = client
        .database("digital_twin_test")
        .collection(&format!("placements_{}", Uuid::new_v4()));
    MongoPlacements::new(col)
}

fn placement(sensor_id: &str, x: f64) -> Placement {
    Placement {
        sensor_id: sensor_id.to_owned(),
        position: Coordinates { x, y: 1.5, z: -2.0 },
    }
}

fn upserting(placements: Vec<Placement>) -> PlacementChanges {
    PlacementChanges::checked(placements, Vec::new()).unwrap()
}

fn deleting(sensor_ids: Vec<&str>) -> PlacementChanges {
    PlacementChanges::checked(
        Vec::new(),
        sensor_ids.into_iter().map(str::to_owned).collect(),
    )
    .unwrap()
}

async fn sorted(store: &MongoPlacements, building_id: &str) -> Vec<Placement> {
    let mut placements = store.load(building_id).await.unwrap();
    placements.sort_by(|a, b| a.sensor_id.cmp(&b.sensor_id));
    placements
}

#[tokio::test]
async fn placements_round_trip_and_stay_inside_their_building() {
    let store = test_store().await;
    store
        .apply(
            "b1",
            &upserting(vec![placement("s1", 1.0), placement("s2", 2.0)]),
        )
        .await
        .unwrap();
    store
        .apply("b2", &upserting(vec![placement("s3", 3.0)]))
        .await
        .unwrap();

    assert_eq!(
        sorted(&store, "b1").await,
        vec![placement("s1", 1.0), placement("s2", 2.0)]
    );
    assert_eq!(sorted(&store, "b2").await, vec![placement("s3", 3.0)]);
    assert!(store.load("b9").await.unwrap().is_empty());
}

#[tokio::test]
async fn an_upsert_moves_a_placement_that_is_already_stored() {
    let store = test_store().await;
    for x in [1.0, 7.25] {
        store
            .apply("b1", &upserting(vec![placement("s1", x)]))
            .await
            .unwrap();
    }

    assert_eq!(sorted(&store, "b1").await, vec![placement("s1", 7.25)]);
}

#[tokio::test]
async fn a_batch_upserts_and_deletes_in_one_write() {
    let store = test_store().await;
    store
        .apply(
            "b1",
            &upserting(vec![placement("s1", 1.0), placement("s2", 2.0)]),
        )
        .await
        .unwrap();

    store
        .apply(
            "b1",
            &PlacementChanges::checked(vec![placement("s3", 3.0)], vec!["s1".to_owned()]).unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        sorted(&store, "b1").await,
        vec![placement("s2", 2.0), placement("s3", 3.0)]
    );
}

#[tokio::test]
async fn deleting_a_placement_that_is_not_stored_changes_nothing() {
    let store = test_store().await;
    store
        .apply("b1", &upserting(vec![placement("s1", 1.0)]))
        .await
        .unwrap();

    store.apply("b1", &deleting(vec!["ghost"])).await.unwrap();

    assert_eq!(sorted(&store, "b1").await, vec![placement("s1", 1.0)]);
}

#[tokio::test]
async fn replaying_the_same_batch_gives_the_same_result() {
    let store = test_store().await;
    let batch =
        PlacementChanges::checked(vec![placement("s1", 1.0)], vec!["s2".to_owned()]).unwrap();

    store.apply("b1", &batch).await.unwrap();
    let after_first = sorted(&store, "b1").await;
    store.apply("b1", &batch).await.unwrap();

    assert_eq!(sorted(&store, "b1").await, after_first);
    assert_eq!(after_first, vec![placement("s1", 1.0)]);
}

#[tokio::test]
async fn an_empty_batch_is_accepted_and_stores_nothing() {
    let store = test_store().await;
    store
        .apply(
            "b1",
            &PlacementChanges::checked(Vec::new(), Vec::new()).unwrap(),
        )
        .await
        .unwrap();

    assert!(store.load("b1").await.unwrap().is_empty());
}
