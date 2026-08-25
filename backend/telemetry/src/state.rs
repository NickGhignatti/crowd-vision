use crate::adapters::driven::dispatch::HttpDispatch;
use crate::adapters::ingest_auth::IngestKey;
use crate::kernel::actions::Actions;
use crate::kernel::ingest::Ingest;
use crate::kernel::ports::{BuildingDirectory, Clock};
use crate::kernel::readings::Readings;
use crate::kernel::registration::Registration;
use crate::kernel::registry::PluginRegistry;
use crate::kernel::sensors::Sensors;
use crate::kernel::thresholds::Thresholds;
use crate::types::sensor::Sensor;
use serde_json::Value;
use std::sync::Arc;

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        chrono::Utc::now().timestamp_millis()
    }
}

pub struct AppState {
    pub registry: Arc<PluginRegistry>,
    pub pool: sqlx::PgPool,
    pub directory: Arc<dyn BuildingDirectory>,
    pub dispatch: Arc<HttpDispatch>,
    pub ingest_key: IngestKey,
    pub ingest: Ingest,
    pub readings: Readings,
    pub thresholds: Thresholds,
    pub sensors: Sensors,
    pub actions: Actions,
    pub registration: Registration,
}

impl AppState {
    pub async fn with_actions(&self, sensors: &[Sensor]) -> Vec<Value> {
        sensors
            .iter()
            .map(|sensor| {
                let declared: Vec<&str> = self
                    .registry
                    .get(&sensor.sensor_type)
                    .map(|plugin| plugin.actions().iter().map(|spec| spec.name).collect())
                    .unwrap_or_default();
                let bound = self.dispatch.actions_for_sensor(sensor.driver.as_deref());
                let actions: Vec<String> = bound
                    .into_iter()
                    .filter(|action| declared.contains(&action.as_str()))
                    .collect();
                serde_json::json!({
                    "buildingId": sensor.building_id,
                    "roomId": sensor.room_id,
                    "sensorId": sensor.sensor_id,
                    "sensorType": sensor.sensor_type,
                    "actions": actions,
                })
            })
            .collect()
    }
}
