use futures::TryStreamExt;
use mongodb::{
    bson::doc,
    options::{ClientOptions, IndexOptions},
    Client, Collection, IndexModel,
};

use crate::models::PreferenceDocument;

/// Connects to MongoDB, ensures a unique index on `building_id`, and returns
/// a typed collection handle.
///
/// The MongoDB driver is lazy — no actual TCP connection is made here;
/// it is established on the first query.
pub async fn connect(uri: &str) -> anyhow::Result<Collection<PreferenceDocument>> {
    let opts = ClientOptions::parse(uri).await?;
    let client = Client::with_options(opts)?;
    let col = client
        .database("crowdvision")
        .collection::<PreferenceDocument>("preferences");

    // Unique index: enforces one document per building at the database level.
    let index = IndexModel::builder()
        .keys(doc! { "building_id": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();
    col.create_index(index).await?;

    Ok(col)
}

/// Fetches every preference document. Called once at startup to seed the
/// in-memory DashMap.
pub async fn load_all(
    col: &Collection<PreferenceDocument>,
) -> anyhow::Result<Vec<PreferenceDocument>> {
    let cursor = col.find(doc! {}).await?;
    Ok(cursor.try_collect().await?)
}

/// Upserts a single building's preference. Replaces the existing document if
/// one exists (`upsert: true`), so this is safe to call repeatedly.
pub async fn upsert_preference(
    col: &Collection<PreferenceDocument>,
    building_id: &str,
    allowed_columns: &[String],
) -> anyhow::Result<()> {
    let document = PreferenceDocument {
        id: None,
        building_id: building_id.to_string(),
        allowed_columns: allowed_columns.to_vec(),
    };
    let filter = doc! { "building_id": building_id };
    col.find_one_and_replace(filter, document).upsert(true).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Returns a collection in a dedicated test database. Requires a running
    /// MongoDB at MONGO_URI (defaults to localhost:27017).
    /// Run with: `MONGO_URI=mongodb://localhost:27017 cargo test`
    async fn test_col() -> Collection<PreferenceDocument> {
        let uri = std::env::var("MONGO_URI")
            .unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let opts = ClientOptions::parse(&uri).await.unwrap();
        let client = Client::with_options(opts).unwrap();
        client
            .database("crowdvision_test")
            .collection::<PreferenceDocument>("preferences_test")
    }

    #[tokio::test]
    #[ignore = "requires a running MongoDB instance"]
    async fn test_upsert_and_load() {
        let col = test_col().await;
        col.drop().await.unwrap();

        upsert_preference(&col, "building-1", &["roomName".to_string()])
            .await
            .unwrap();

        let all = load_all(&col).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].building_id, "building-1");
        assert_eq!(all[0].allowed_columns, vec!["roomName"]);
    }

    #[tokio::test]
    #[ignore = "requires a running MongoDB instance"]
    async fn test_upsert_replaces_existing() {
        let col = test_col().await;
        col.drop().await.unwrap();

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
    #[ignore = "requires a running MongoDB instance"]
    async fn test_load_empty_collection() {
        let col = test_col().await;
        col.drop().await.unwrap();

        let all = load_all(&col).await.unwrap();
        assert!(all.is_empty());
    }
}
