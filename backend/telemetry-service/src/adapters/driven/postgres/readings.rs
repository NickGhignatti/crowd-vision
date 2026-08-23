use super::{to_millis, to_timestamp};
use crate::adapters::metrics;
use crate::contracts::plugin::ENVELOPE_FIELDS;
use crate::contracts::query::Bucket;
use crate::contracts::reading::Reading;
use crate::kernel::ports::ReadingStore;
use crate::kernel::registry::PluginRegistry;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::{Map, Value};
use sqlx::{PgPool, Row};
use std::sync::Arc;
use std::time::Instant;

pub struct PgReadings {
    pool: PgPool,
    registry: Arc<PluginRegistry>,
}

impl PgReadings {
    pub fn new(pool: PgPool, registry: Arc<PluginRegistry>) -> Self {
        Self { pool, registry }
    }

    fn value_field(&self, metric: &str) -> Option<&'static str> {
        self.registry
            .get(metric)
            .map(|plugin| plugin.descriptor().value_field)
    }

    fn trim(&self, reading: &Reading) -> Map<String, Value> {
        let value_field = self.value_field(&reading.metric);
        reading
            .payload
            .iter()
            .filter(|(key, _)| !ENVELOPE_FIELDS.contains(&key.as_str()))
            .filter(|(key, _)| Some(key.as_str()) != value_field)
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect()
    }

    fn construct(&self, row: &sqlx::postgres::PgRow) -> Reading {
        let building_id: String = row.get("building_id");
        let room_id: String = row.get("room_id");
        let metric: String = row.get("metric");
        let ts: DateTime<Utc> = row.get("ts");
        let value: f64 = row.get("value");
        let ts_ms = to_millis(ts);

        let mut payload: Map<String, Value> = row
            .get::<Value, _>("payload")
            .as_object()
            .cloned()
            .unwrap_or_default();
        payload.insert("buildingId".to_owned(), Value::from(building_id.clone()));
        payload.insert("roomId".to_owned(), Value::from(room_id.clone()));
        payload.insert("timestamp".to_owned(), Value::from(ts_ms));
        if let Some(field) = self.value_field(&metric) {
            payload.insert(field.to_owned(), Value::from(value));
        }

        Reading {
            building_id,
            room_id,
            metric,
            ts_ms,
            value,
            payload,
        }
    }
}

#[async_trait]
impl ReadingStore for PgReadings {
    async fn insert(&self, readings: &[Reading]) -> anyhow::Result<()> {
        if readings.is_empty() {
            return Ok(());
        }

        let started = Instant::now();
        let mut builder = sqlx::QueryBuilder::new(
            "insert into readings (building_id, room_id, metric, ts, value, payload) ",
        );
        builder.push_values(readings, |mut row, reading| {
            row.push_bind(&reading.building_id)
                .push_bind(&reading.room_id)
                .push_bind(&reading.metric)
                .push_bind(to_timestamp(reading.ts_ms))
                .push_bind(reading.value)
                .push_bind(Value::Object(self.trim(reading)));
        });
        let inserted = builder.build().execute(&self.pool).await;

        let elapsed = started.elapsed();
        for reading in readings {
            metrics::record_persist_duration(&reading.metric, elapsed);
            if inserted.is_err() {
                metrics::record_persist_failure(&reading.metric);
            }
        }
        inserted?;
        Ok(())
    }

    async fn latest(
        &self,
        building_id: &str,
        metric: &str,
        room_id: &str,
    ) -> anyhow::Result<Option<Reading>> {
        let row = sqlx::query(
            "select building_id, room_id, metric, ts, value, payload from readings
             where building_id = $1 and metric = $2 and room_id = $3
             order by ts desc limit 1",
        )
        .bind(building_id)
        .bind(metric)
        .bind(room_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|row| self.construct(&row)))
    }

    async fn latest_per_room(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Vec<Reading>> {
        let rows = sqlx::query(
            "select distinct on (room_id)
                 building_id, room_id, metric, ts, value, payload
             from readings
             where building_id = $1 and metric = $2
             order by room_id, ts desc",
        )
        .bind(building_id)
        .bind(metric)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows.iter().map(|row| self.construct(row)).collect())
    }

    async fn series(
        &self,
        building_id: &str,
        metric: &str,
        room_id: Option<&str>,
        window: (i64, i64),
        bucket: &str,
        agg: &str,
    ) -> anyhow::Result<Vec<Bucket>> {
        if !["avg", "sum", "min", "max"].contains(&agg) {
            anyhow::bail!("unsupported aggregate: {agg}");
        }
        let rollup = bucket != "1 hour";
        let value = if rollup {
            format!("{agg}({agg})")
        } else {
            format!("{agg}(value)")
        };
        let source = if rollup {
            "readings_hourly"
        } else {
            "readings"
        };
        let column = if rollup { "bucket" } else { "ts" };

        let sql = format!(
            "select time_bucket($1::interval, {column}) as slot, {value} as value
             from {source}
             where building_id = $2 and metric = $3
               and {column} >= $4 and {column} <= $5
               and ($6::text is null or room_id = $6)
             group by slot order by slot asc"
        );

        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(bucket)
            .bind(building_id)
            .bind(metric)
            .bind(to_timestamp(window.0))
            .bind(to_timestamp(window.1))
            .bind(room_id)
            .fetch_all(&self.pool)
            .await?;

        Ok(rows
            .iter()
            .map(|row| Bucket {
                ts_ms: to_millis(row.get::<DateTime<Utc>, _>("slot")),
                value: row.get::<f64, _>("value"),
            })
            .collect())
    }
}
