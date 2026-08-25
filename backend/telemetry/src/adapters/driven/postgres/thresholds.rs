use crate::kernel::ports::ThresholdStore;
use crate::types::threshold;
use crate::types::threshold::{Bounds, RoomTemperatureLimit, TemperatureLimits};
use async_trait::async_trait;
use serde_json::Value;
use sqlx::{PgPool, Row};
use std::collections::HashMap;

pub struct PgThresholds {
    pool: PgPool,
}

impl PgThresholds {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn as_bounds(value: Value) -> Bounds {
    value.as_object().cloned().unwrap_or_default()
}

#[async_trait]
impl ThresholdStore for PgThresholds {
    async fn resolve(
        &self,
        building_id: &str,
        keys: &[(&str, &str)],
    ) -> anyhow::Result<Vec<Option<Bounds>>> {
        if keys.is_empty() {
            return Ok(Vec::new());
        }

        let metrics: Vec<&str> = keys.iter().map(|(metric, _)| *metric).collect();
        let rooms: Vec<&str> = keys.iter().map(|(_, room_id)| *room_id).collect();
        let rows = sqlx::query(
            "select metric, room_id, bounds from thresholds
             where building_id = $1 and metric = any($2)
               and (room_id is null or room_id = any($3))",
        )
        .bind(building_id)
        .bind(&metrics)
        .bind(&rooms)
        .fetch_all(&self.pool)
        .await?;

        let mut scoped: HashMap<(String, Option<String>), Bounds> = HashMap::new();
        for row in rows {
            scoped.insert(
                (row.get("metric"), row.get("room_id")),
                as_bounds(row.get("bounds")),
            );
        }

        Ok(keys
            .iter()
            .map(|(metric, room_id)| {
                threshold::resolve(
                    scoped.get(&((*metric).to_owned(), Some((*room_id).to_owned()))),
                    scoped.get(&((*metric).to_owned(), None)),
                )
                .cloned()
            })
            .collect())
    }

    async fn building_bounds(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Option<Bounds>> {
        let row: Option<Value> = sqlx::query_scalar(
            "select bounds from thresholds
             where building_id = $1 and metric = $2 and room_id is null",
        )
        .bind(building_id)
        .bind(metric)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(as_bounds))
    }

    async fn upsert(
        &self,
        building_id: &str,
        room_id: Option<&str>,
        metric: &str,
        patch: &Bounds,
    ) -> anyhow::Result<Bounds> {
        let merged: Value = sqlx::query_scalar(
            "insert into thresholds (building_id, room_id, metric, bounds)
             values ($1, $2, $3, $4)
             on conflict (building_id, coalesce(room_id, ''), metric)
             do update set bounds = thresholds.bounds || excluded.bounds,
                           updated_at = now()
             returning bounds",
        )
        .bind(building_id)
        .bind(room_id)
        .bind(metric)
        .bind(Value::Object(patch.clone()))
        .fetch_one(&self.pool)
        .await?;
        Ok(as_bounds(merged))
    }

    async fn temperature_limits(
        &self,
        building_id: &str,
    ) -> anyhow::Result<Option<TemperatureLimits>> {
        let building: Option<Value> = sqlx::query_scalar(
            "select coalesce(t.bounds -> 'maxTemp', 'null'::jsonb)
             from buildings b
             left join thresholds t
               on t.building_id = b.id and t.metric = 'temperature' and t.room_id is null
             where b.id = $1",
        )
        .bind(building_id)
        .fetch_optional(&self.pool)
        .await?;

        let Some(max_temperature) = building else {
            return Ok(None);
        };

        let rows = sqlx::query(
            "select r.room_id, t.bounds -> 'maxTemp' as max_temperature
             from building_rooms r
             left join thresholds t
               on t.building_id = r.building_id and t.room_id = r.room_id
                  and t.metric = 'temperature'
             where r.building_id = $1
             order by r.room_id",
        )
        .bind(building_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(Some(TemperatureLimits {
            building_id: building_id.to_owned(),
            max_temperature: max_temperature.as_f64(),
            rooms: rows
                .iter()
                .map(|row| RoomTemperatureLimit {
                    room_id: row.get("room_id"),
                    max_temperature: row
                        .get::<Option<Value>, _>("max_temperature")
                        .and_then(|value| value.as_f64()),
                })
                .collect(),
        }))
    }
}
