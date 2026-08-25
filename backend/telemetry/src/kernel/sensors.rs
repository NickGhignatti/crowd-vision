use crate::kernel::ports::{RegisterError, SensorStore};
use crate::kernel::registry::PluginRegistry;
use crate::types::error::DomainError;
use crate::types::sensor::Sensor;
use serde_json::Value;
use std::sync::Arc;

pub struct Sensors {
    pub registry: Arc<PluginRegistry>,
    pub store: Arc<dyn SensorStore>,
}

impl Sensors {
    pub async fn register(&self, payload: &Value) -> Result<Sensor, DomainError> {
        let data = payload
            .get("sensorData")
            .filter(|data| data.is_object())
            .ok_or_else(|| DomainError::Validation("sensorData: must be an object.".to_owned()))?;

        let sensor = Sensor {
            building_id: field(data, "buildingId")?,
            room_id: field(data, "roomId")?,
            sensor_id: field(data, "sensorId")?,
            sensor_type: field(data, "sensorType")?,
            driver: optional(data, "driver"),
            endpoint: optional(data, "endpoint"),
        };

        if self.registry.get(&sensor.sensor_type).is_none() {
            return Err(DomainError::NotFound(format!(
                "unknown sensor type: {}",
                sensor.sensor_type
            )));
        }

        match self.store.register(&sensor).await {
            Ok(()) => Ok(sensor),
            Err(RegisterError::AlreadyExists) => Err(DomainError::Conflict(format!(
                "sensor {} is already registered in this room.",
                sensor.sensor_id
            ))),
            Err(RegisterError::Other(error)) => Err(DomainError::Internal(error)),
        }
    }

    pub async fn by_building(&self, building_id: &str) -> Result<Vec<Sensor>, DomainError> {
        Ok(self.store.by_building(building_id).await?)
    }

    pub async fn by_room(
        &self,
        building_id: &str,
        room_id: &str,
    ) -> Result<Vec<Sensor>, DomainError> {
        Ok(self.store.by_room(building_id, room_id).await?)
    }
}

fn optional(data: &Value, name: &str) -> Option<String> {
    data[name]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn field(data: &Value, name: &str) -> Result<String, DomainError> {
    data[name]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| DomainError::Validation(format!("{name}: must be a non-empty string.")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakePlugin, FakeSensors};
    use serde_json::json;

    struct Harness {
        store: Arc<FakeSensors>,
        sensors: Sensors,
    }

    fn harness(store: FakeSensors) -> Harness {
        let store = Arc::new(store);
        let registry =
            Arc::new(PluginRegistry::new(vec![Box::new(FakePlugin::default())]).unwrap());
        let sensors = Sensors {
            registry,
            store: store.clone() as Arc<dyn SensorStore>,
        };
        Harness { store, sensors }
    }

    fn plain() -> Harness {
        harness(FakeSensors::default())
    }

    fn payload() -> Value {
        json!({ "sensorData": {
            "buildingId": "b1", "roomId": "r1", "sensorId": "s1", "sensorType": "fake"
        }})
    }

    #[tokio::test]
    async fn a_valid_sensor_is_registered() {
        let h = plain();
        let sensor = h.sensors.register(&payload()).await.unwrap();
        assert_eq!(sensor.sensor_id, "s1");
        assert_eq!(h.store.registered.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_missing_sensor_data_is_a_validation_error() {
        let h = plain();
        let error = h.sensors.register(&json!({})).await.unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.store.registered.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_non_object_sensor_data_is_a_validation_error() {
        let h = plain();
        let error = h
            .sensors
            .register(&json!({ "sensorData": "s1" }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
    }

    #[tokio::test]
    async fn a_blank_field_is_a_validation_error() {
        let h = plain();
        let error = h
            .sensors
            .register(&json!({ "sensorData": {
                "buildingId": "b1", "roomId": "  ", "sensorId": "s1", "sensorType": "fake"
            }}))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.store.registered.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_unknown_sensor_type_is_not_found() {
        let h = plain();
        let error = h
            .sensors
            .register(&json!({ "sensorData": {
                "buildingId": "b1", "roomId": "r1", "sensorId": "s1", "sensorType": "humidity"
            }}))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
        assert!(h.store.registered.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_duplicate_sensor_is_a_conflict() {
        let h = plain();
        h.sensors.register(&payload()).await.unwrap();
        let error = h.sensors.register(&payload()).await.unwrap_err();
        assert!(matches!(error, DomainError::Conflict(_)));
        assert_eq!(h.store.registered.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn the_same_sensor_id_in_another_room_is_allowed() {
        let h = plain();
        h.sensors.register(&payload()).await.unwrap();
        h.sensors
            .register(&json!({ "sensorData": {
                "buildingId": "b1", "roomId": "r2", "sensorId": "s1", "sensorType": "fake"
            }}))
            .await
            .unwrap();
        assert_eq!(h.store.registered.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn sensors_are_listed_by_building_and_by_room() {
        let h = plain();
        for room in ["r1", "r2"] {
            h.sensors
                .register(&json!({ "sensorData": {
                    "buildingId": "b1", "roomId": room, "sensorId": "s1", "sensorType": "fake"
                }}))
                .await
                .unwrap();
        }
        assert_eq!(h.sensors.by_building("b1").await.unwrap().len(), 2);
        assert_eq!(h.sensors.by_room("b1", "r1").await.unwrap().len(), 1);
        assert!(h.sensors.by_building("b2").await.unwrap().is_empty());
    }
}
