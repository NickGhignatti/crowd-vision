use async_trait::async_trait;
use mongodb::{
    Client, Collection,
    bson::{Document, doc},
    options::ClientOptions,
};

use crate::domain::{Coordinates, Placement, PlacementChanges};
use crate::service::ports::PlacementStore;

const SENSORS: &str = "sensors";

/// One document per building, `{ _id, sensors: { <sensorId>: { x, y, z } } }`. A single-document
/// update is atomic, which is what makes a batch all-or-nothing on a standalone MongoDB.
pub struct MongoPlacements {
    col: Collection<Document>,
}

impl MongoPlacements {
    pub fn new(col: Collection<Document>) -> Self {
        Self { col }
    }
}

pub async fn connect(uri: &str, db_name: &str) -> anyhow::Result<Collection<Document>> {
    let opts = ClientOptions::parse(uri).await?;
    let client = Client::with_options(opts)?;
    Ok(client
        .database(db_name)
        .collection::<Document>("placements"))
}

#[async_trait]
impl PlacementStore for MongoPlacements {
    async fn load(&self, building_id: &str) -> anyhow::Result<Vec<Placement>> {
        let Some(document) = self.col.find_one(doc! { "_id": building_id }).await? else {
            return Ok(Vec::new());
        };
        let Ok(sensors) = document.get_document(SENSORS) else {
            return Ok(Vec::new());
        };

        sensors
            .iter()
            .map(|(sensor_id, position)| {
                let position: Coordinates =
                    mongodb::bson::from_bson(position.clone()).map_err(anyhow::Error::from)?;
                Ok(Placement {
                    sensor_id: sensor_id.clone(),
                    position,
                })
            })
            .collect()
    }

    async fn apply(&self, building_id: &str, changes: &PlacementChanges) -> anyhow::Result<()> {
        if changes.is_empty() {
            return Ok(());
        }

        let mut update = Document::new();
        if !changes.upsert.is_empty() {
            let mut set = Document::new();
            for placement in &changes.upsert {
                set.insert(
                    format!("{SENSORS}.{}", placement.sensor_id),
                    mongodb::bson::to_bson(&placement.position)?,
                );
            }
            update.insert("$set", set);
        }
        if !changes.delete.is_empty() {
            let unset: Document = changes
                .delete
                .iter()
                .map(|sensor_id| (format!("{SENSORS}.{sensor_id}"), "".into()))
                .collect();
            update.insert("$unset", unset);
        }

        self.col
            .update_one(doc! { "_id": building_id }, update)
            .upsert(true)
            .await?;
        Ok(())
    }
}
