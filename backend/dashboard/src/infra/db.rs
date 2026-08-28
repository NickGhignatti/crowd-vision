use futures::TryStreamExt;
use mongodb::{
    Client, Collection, IndexModel,
    bson::doc,
    options::{ClientOptions, IndexOptions},
};

use crate::models::PreferenceDocument;

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

/// Fetches every preference document. Called once at startup to seed in-memory DashMap.
pub async fn load_all(
    col: &Collection<PreferenceDocument>,
) -> anyhow::Result<Vec<PreferenceDocument>> {
    let cursor = col.find(doc! {}).await?;
    Ok(cursor.try_collect().await?)
}

/// Upserts a single building's preference.
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
    col.find_one_and_replace(filter, document)
        .upsert(true)
        .await?;
    Ok(())
}
