use crate::contracts::sensor::Sensor;
use crate::kernel::ports::{RegisterError, SensorStore};
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
        sensor_type: row.get("sensor_type"),
        driver: row.get("driver"),
        endpoint: row.get("endpoint"),
    }
}

#[async_trait]
impl SensorStore for PgSensors {
    async fn register(&self, sensor: &Sensor) -> Result<(), RegisterError> {
        let result = sqlx::query(
            "insert into sensors (building_id, room_id, sensor_id, sensor_type, driver, endpoint)
             values ($1, $2, $3, $4, $5, $6)
             on conflict (building_id, room_id, sensor_id) do nothing",
        )
        .bind(&sensor.building_id)
        .bind(&sensor.room_id)
        .bind(&sensor.sensor_id)
        .bind(&sensor.sensor_type)
        .bind(&sensor.driver)
        .bind(&sensor.endpoint)
        .execute(&self.pool)
        .await
        .map_err(|error| RegisterError::Other(error.into()))?;

        match result.rows_affected() {
            0 => Err(RegisterError::AlreadyExists),
            _ => Ok(()),
        }
    }

    async fn by_building(&self, building_id: &str) -> anyhow::Result<Vec<Sensor>> {
        let rows = sqlx::query(
            "select building_id, room_id, sensor_id, sensor_type, driver, endpoint from sensors
             where building_id = $1 order by room_id, sensor_id",
        )
        .bind(building_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(as_sensor).collect())
    }

    async fn by_room(&self, building_id: &str, room_id: &str) -> anyhow::Result<Vec<Sensor>> {
        let rows = sqlx::query(
            "select building_id, room_id, sensor_id, sensor_type, driver, endpoint from sensors
             where building_id = $1 and room_id = $2 order by sensor_id",
        )
        .bind(building_id)
        .bind(room_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(as_sensor).collect())
    }
}
