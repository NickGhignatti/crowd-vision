use crate::kernel::ports::SensorStore;
use crate::types::sensor::{Sensor, SensorChanges};
use async_trait::async_trait;
use sqlx::{PgPool, Row};

pub struct PgSensors {
    pool: PgPool,
}

impl PgSensors {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn as_sensor(row: &sqlx::postgres::PgRow) -> Sensor {
    Sensor {
        building_id: row.get("building_id"),
        room_id: row.get("room_id"),
        sensor_id: row.get("sensor_id"),
        name: row.get("name"),
        sensor_type: row.get("sensor_type"),
        driver: row.get("driver"),
        endpoint: row.get("endpoint"),
    }
}

#[async_trait]
impl SensorStore for PgSensors {
    async fn apply(&self, building_id: &str, changes: &SensorChanges) -> anyhow::Result<()> {
        let mut tx = self.pool.begin().await?;

        for sensor in &changes.create {
            sqlx::query(
                "insert into sensors (building_id, room_id, sensor_id, name, sensor_type, driver, endpoint)
                 values ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(building_id)
            .bind(&sensor.room_id)
            .bind(&sensor.sensor_id)
            .bind(&sensor.name)
            .bind(&sensor.sensor_type)
            .bind(&sensor.driver)
            .bind(&sensor.endpoint)
            .execute(&mut *tx)
            .await?;
        }

        for update in &changes.update {
            let result = sqlx::query(
                "update sensors
                 set name = coalesce($3, name),
                     room_id = case when $4 then $5 else room_id end
                 where building_id = $1 and sensor_id = $2",
            )
            .bind(building_id)
            .bind(&update.sensor_id)
            .bind(&update.name)
            .bind(update.room_id.is_some())
            .bind(update.room_id.clone().flatten())
            .execute(&mut *tx)
            .await?;
            if result.rows_affected() == 0 {
                anyhow::bail!(
                    "sensor {} is not in building {building_id}",
                    update.sensor_id
                );
            }
        }

        for sensor_id in &changes.delete {
            let result =
                sqlx::query("delete from sensors where building_id = $1 and sensor_id = $2")
                    .bind(building_id)
                    .bind(sensor_id)
                    .execute(&mut *tx)
                    .await?;
            if result.rows_affected() == 0 {
                anyhow::bail!("sensor {sensor_id} is not in building {building_id}");
            }
        }

        tx.commit().await?;
        Ok(())
    }

    async fn by_building(&self, building_id: &str) -> anyhow::Result<Vec<Sensor>> {
        let rows = sqlx::query(
            "select building_id, room_id, sensor_id, name, sensor_type, driver, endpoint from sensors
             where building_id = $1 order by room_id, name, sensor_id",
        )
        .bind(building_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(as_sensor).collect())
    }

    async fn by_room(&self, building_id: &str, room_id: &str) -> anyhow::Result<Vec<Sensor>> {
        let rows = sqlx::query(
            "select building_id, room_id, sensor_id, name, sensor_type, driver, endpoint from sensors
             where building_id = $1 and room_id = $2 order by name, sensor_id",
        )
        .bind(building_id)
        .bind(room_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(as_sensor).collect())
    }
}
