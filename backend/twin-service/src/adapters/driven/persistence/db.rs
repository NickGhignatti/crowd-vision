use async_trait::async_trait;
use futures::TryStreamExt;
use mongodb::{
    Client, Collection, IndexModel,
    bson::{Document, doc},
    options::{ClientOptions, IndexOptions},
};
use std::collections::HashMap;

use crate::domain::Building;
use crate::service::ports::BuildingStore;

pub struct MongoBuildings {
    col: Collection<Building>,
}

impl MongoBuildings {
    pub fn new(col: Collection<Building>) -> Self {
        Self { col }
    }
}

#[async_trait]
impl BuildingStore for MongoBuildings {
    async fn find_by_id(&self, id: &str) -> anyhow::Result<Option<Building>> {
        find_by_id(&self.col, id).await
    }

    async fn find_by_domain(&self, domain: &str) -> anyhow::Result<Vec<Building>> {
        find_by_domain(&self.col, domain).await
    }

    async fn find_by_name(&self, name: &str) -> anyhow::Result<Vec<Building>> {
        find_by_name(&self.col, name).await
    }

    async fn upsert(&self, building: &Building) -> anyhow::Result<()> {
        upsert(&self.col, building).await
    }

    async fn counts_by_domain(&self, domains: &[String]) -> anyhow::Result<HashMap<String, i64>> {
        counts_by_domain(&self.col, domains).await
    }
}

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
    Ok(col.find_one(by_id_filter(id)).await?)
}

pub async fn find_by_domain(
    col: &Collection<Building>,
    domain: &str,
) -> anyhow::Result<Vec<Building>> {
    let cursor = col.find(by_domain_filter(domain)).await?;
    Ok(cursor.try_collect().await?)
}

pub async fn find_by_name(col: &Collection<Building>, name: &str) -> anyhow::Result<Vec<Building>> {
    let cursor = col.find(by_name_filter(name)).await?;
    Ok(cursor.try_collect().await?)
}

pub async fn insert(col: &Collection<Building>, building: &Building) -> anyhow::Result<()> {
    col.insert_one(building).await?;
    Ok(())
}

pub async fn upsert(col: &Collection<Building>, building: &Building) -> anyhow::Result<()> {
    col.replace_one(id_match_filter(&building.id), building)
        .upsert(true)
        .await?;
    Ok(())
}

pub async fn replace(col: &Collection<Building>, building: &Building) -> anyhow::Result<()> {
    col.find_one_and_replace(id_match_filter(&building.id), building)
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

    let mut cursor: mongodb::Cursor<Document> = col.aggregate(counts_pipeline(domains)).await?;
    let mut docs = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        docs.push(doc);
    }
    Ok(parse_domain_counts(&docs))
}

fn by_id_filter(id: &str) -> Document {
    doc! { "id": { "$eq": id } }
}

fn by_domain_filter(domain: &str) -> Document {
    doc! { "domains": { "$eq": domain } }
}

fn by_name_filter(name: &str) -> Document {
    doc! { "name": { "$eq": name } }
}

fn id_match_filter(id: &str) -> Document {
    doc! { "id": id }
}

fn counts_pipeline(domains: &[String]) -> Vec<Document> {
    vec![
        doc! { "$unwind": "$domains" },
        doc! { "$match": { "domains": { "$in": domains } } },
        doc! { "$group": { "_id": "$domains", "count": { "$sum": 1 } } },
    ]
}

fn parse_domain_counts(docs: &[Document]) -> HashMap<String, i64> {
    let mut result = HashMap::new();
    for doc in docs {
        let Ok(domain) = doc.get_str("_id") else {
            continue;
        };
        let count = doc.get_i32("count").unwrap_or(0);
        result.insert(domain.to_string(), count as i64);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn by_id_filter_matches_exact_id() {
        assert_eq!(by_id_filter("b1"), doc! { "id": { "$eq": "b1" } });
    }

    #[test]
    fn by_domain_filter_matches_exact_domain() {
        assert_eq!(
            by_domain_filter("eng"),
            doc! { "domains": { "$eq": "eng" } }
        );
    }

    #[test]
    fn by_name_filter_matches_exact_name() {
        assert_eq!(by_name_filter("HQ"), doc! { "name": { "$eq": "HQ" } });
    }

    #[test]
    fn id_match_filter_matches_exact_id() {
        assert_eq!(id_match_filter("b1"), doc! { "id": "b1" });
    }

    #[test]
    fn counts_pipeline_unwinds_matches_and_groups_by_domain() {
        let domains = vec!["eng".to_string(), "ops".to_string()];
        assert_eq!(
            counts_pipeline(&domains),
            vec![
                doc! { "$unwind": "$domains" },
                doc! { "$match": { "domains": { "$in": &domains } } },
                doc! { "$group": { "_id": "$domains", "count": { "$sum": 1 } } },
            ]
        );
    }

    #[test]
    fn parse_domain_counts_reads_id_and_count_per_document() {
        let docs = vec![
            doc! { "_id": "eng", "count": 2 },
            doc! { "_id": "other", "count": 1 },
        ];
        let counts = parse_domain_counts(&docs);
        assert_eq!(counts.get("eng"), Some(&2));
        assert_eq!(counts.get("other"), Some(&1));
    }

    #[test]
    fn parse_domain_counts_defaults_missing_count_to_zero() {
        let docs = vec![doc! { "_id": "eng" }];
        assert_eq!(parse_domain_counts(&docs).get("eng"), Some(&0));
    }

    #[test]
    fn parse_domain_counts_skips_documents_without_an_id() {
        let docs = vec![doc! { "count": 5 }];
        assert!(parse_domain_counts(&docs).is_empty());
    }
}
