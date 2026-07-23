use futures::TryStreamExt;
use mongodb::{
    Client, Collection, IndexModel,
    bson::{Document, doc},
    options::{ClientOptions, IndexOptions},
};
use std::collections::HashMap;

use crate::models::Building;

pub async fn connect(uri: &str, db_name: &str) -> anyhow::Result<Collection<Building>> {
    let opts = ClientOptions::parse(uri).await?;
    let client = Client::with_options(opts)?;
    let col = client.database(db_name).collection::<Building>("buildings");

    let unique_id = IndexModel::builder()
        .keys(doc! { "id": 1 })
        .options(IndexOptions::builder().unique(true).build())
        .build();
    col.create_index(unique_id).await?;

    let domains_index = IndexModel::builder().keys(doc! { "domains": 1 }).build();
    col.create_index(domains_index).await?;

    Ok(col)
}

pub async fn find_by_id(col: &Collection<Building>, id: &str) -> anyhow::Result<Option<Building>> {
    Ok(col.find_one(doc! { "id": { "$eq": id } }).await?)
}

pub async fn find_by_domain(
    col: &Collection<Building>,
    domain: &str,
) -> anyhow::Result<Vec<Building>> {
    let cursor = col.find(doc! { "domains": { "$eq": domain } }).await?;
    Ok(cursor.try_collect().await?)
}

pub async fn find_by_name(col: &Collection<Building>, name: &str) -> anyhow::Result<Vec<Building>> {
    let cursor = col.find(doc! { "name": { "$eq": name } }).await?;
    Ok(cursor.try_collect().await?)
}

pub async fn insert(col: &Collection<Building>, building: &Building) -> anyhow::Result<()> {
    col.insert_one(building).await?;
    Ok(())
}

pub async fn replace(col: &Collection<Building>, building: &Building) -> anyhow::Result<()> {
    col.find_one_and_replace(doc! { "id": &building.id }, building)
        .await?;
    Ok(())
}

pub async fn counts_by_domain(
    col: &Collection<Building>,
    domains: &[String],
) -> anyhow::Result<HashMap<String, i64>> {
    if domains.is_empty() {
        return Ok(HashMap::new());
    }

    let pipeline = vec![
        doc! { "$unwind": "$domains" },
        doc! { "$match": { "domains": { "$in": domains } } },
        doc! { "$group": { "_id": "$domains", "count": { "$sum": 1 } } },
    ];
    let mut cursor: mongodb::Cursor<Document> = col.aggregate(pipeline).await?;
    let mut result = HashMap::new();
    while let Some(doc) = cursor.try_next().await? {
        let Ok(domain) = doc.get_str("_id") else {
            continue;
        };
        let count = doc.get_i32("count").unwrap_or(0);
        result.insert(domain.to_string(), count as i64);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Coordinates, Dimensions, Room};
    use uuid::Uuid;

    fn dummy_room(id: &str) -> Room {
        Room {
            id: id.to_string(),
            name: id.to_string(),
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
        }
    }

    fn dummy_building(domains: Vec<&str>) -> Building {
        Building {
            id: Uuid::new_v4().to_string(),
            name: "Test Building".to_string(),
            rooms: vec![dummy_room("r1")],
            domains: domains.into_iter().map(str::to_string).collect(),
        }
    }

    async fn test_col() -> Collection<Building> {
        let uri =
            std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let opts = ClientOptions::parse(&uri).await.unwrap();
        let client = Client::with_options(opts).unwrap();
        client
            .database("twin_service_test")
            .collection::<Building>(&format!("buildings_{}", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn insert_and_find_by_id_round_trips() {
        let col = test_col().await;
        let building = dummy_building(vec!["eng"]);
        insert(&col, &building).await.unwrap();

        let found = find_by_id(&col, &building.id).await.unwrap();
        assert_eq!(found.unwrap().id, building.id);
    }

    #[tokio::test]
    async fn find_by_id_returns_none_for_unknown_id() {
        let col = test_col().await;
        assert!(find_by_id(&col, "missing").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn find_by_domain_returns_only_matching_buildings() {
        let col = test_col().await;
        insert(&col, &dummy_building(vec!["eng"])).await.unwrap();
        insert(&col, &dummy_building(vec!["other"])).await.unwrap();

        let found = find_by_domain(&col, "eng").await.unwrap();
        assert_eq!(found.len(), 1);
    }

    #[tokio::test]
    async fn replace_persists_mutations() {
        let col = test_col().await;
        let mut building = dummy_building(vec!["eng"]);
        insert(&col, &building).await.unwrap();

        building.name = "Renamed".to_string();
        replace(&col, &building).await.unwrap();

        let found = find_by_id(&col, &building.id).await.unwrap().unwrap();
        assert_eq!(found.name, "Renamed");
    }

    #[tokio::test]
    async fn counts_by_domain_only_counts_requested_domains() {
        let col = test_col().await;
        insert(&col, &dummy_building(vec!["eng"])).await.unwrap();
        insert(&col, &dummy_building(vec!["eng"])).await.unwrap();
        insert(&col, &dummy_building(vec!["other"])).await.unwrap();

        let counts = counts_by_domain(&col, &["eng".to_string(), "unknown".to_string()])
            .await
            .unwrap();
        assert_eq!(counts.get("eng"), Some(&2));
        assert_eq!(counts.get("other"), None);
        assert_eq!(counts.get("unknown"), None);
    }

    #[tokio::test]
    async fn counts_by_domain_returns_empty_map_for_empty_request() {
        let col = test_col().await;
        let counts = counts_by_domain(&col, &[]).await.unwrap();
        assert!(counts.is_empty());
    }
}
