use crate::kernel::ports::BuildingStore;
use crate::types::building::{BuildingNames, RegisteredBuilding};
use async_trait::async_trait;
use sqlx::PgPool;

pub struct PgBuildings {
    pool: PgPool,
}

impl PgBuildings {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl BuildingStore for PgBuildings {
    async fn upsert(&self, building: &RegisteredBuilding) -> anyhow::Result<()> {
        let mut transaction = self.pool.begin().await?;

        sqlx::query(
            "insert into buildings (id, name) values ($1, $2)
             on conflict (id) do update set name = excluded.name",
        )
        .bind(&building.id)
        .bind(&building.name)
        .execute(&mut *transaction)
        .await?;

        let room_ids: Vec<String> = building.rooms.iter().map(|room| room.id.clone()).collect();
        sqlx::query("delete from building_rooms where building_id = $1 and room_id <> all($2)")
            .bind(&building.id)
            .bind(&room_ids)
            .execute(&mut *transaction)
            .await?;

        for room in &building.rooms {
            sqlx::query(
                "insert into building_rooms (building_id, room_id, name) values ($1, $2, $3)
                 on conflict (building_id, room_id) do update set name = excluded.name",
            )
            .bind(&building.id)
            .bind(&room.id)
            .bind(&room.name)
            .execute(&mut *transaction)
            .await?;
        }

        transaction.commit().await?;
        Ok(())
    }

    async fn names_of(&self, building_id: &str) -> anyhow::Result<Option<BuildingNames>> {
        let Some(name) =
            sqlx::query_scalar::<_, String>("select name from buildings where id = $1")
                .bind(building_id)
                .fetch_optional(&self.pool)
                .await?
        else {
            return Ok(None);
        };
        let rooms: Vec<(String, String)> =
            sqlx::query_as("select room_id, name from building_rooms where building_id = $1")
                .bind(building_id)
                .fetch_all(&self.pool)
                .await?;
        Ok(Some(BuildingNames {
            name,
            rooms: rooms.into_iter().collect(),
        }))
    }
}
