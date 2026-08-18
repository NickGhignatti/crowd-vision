use crate::contracts::building::{RegisteredBuilding, Room};
use crate::contracts::error::DomainError;
use crate::contracts::threshold::Bounds;
use crate::kernel::ports::{BuildingStore, RegistrationEvents, ThresholdStore};
use serde_json::Value;
use std::sync::Arc;

pub struct Registration {
    pub buildings: Arc<dyn BuildingStore>,
    pub thresholds: Arc<dyn ThresholdStore>,
    pub events: Arc<dyn RegistrationEvents>,
}

impl Registration {
    pub async fn register(&self, building_id: &str, payload: &Value) -> Result<(), DomainError> {
        let name = payload["name"]
            .as_str()
            .filter(|name| !name.is_empty())
            .ok_or_else(|| {
                DomainError::Validation("name: must be a non-empty string.".to_owned())
            })?;

        let max_temperature = match &payload["maxTemperature"] {
            Value::Null => None,
            value => Some(value.as_f64().ok_or_else(|| {
                DomainError::Validation("maxTemperature: must be a finite number.".to_owned())
            })?),
        };

        self.buildings
            .upsert(&RegisteredBuilding {
                id: building_id.to_owned(),
                name: name.to_owned(),
                rooms: rooms(payload),
            })
            .await?;

        if let Some(max_temperature) = max_temperature {
            let mut patch = Bounds::new();
            patch.insert("maxTemp".to_owned(), max_temperature.into());
            self.thresholds
                .upsert(building_id, None, "temperature", &patch)
                .await?;
        }

        Ok(())
    }

    /// kafka building registration path.
    pub async fn register_from_event(
        &self,
        building_id: &str,
        payload: &Value,
    ) -> anyhow::Result<bool> {
        let outcome = self
            .register(building_id, payload)
            .await
            .map_err(|error| error.to_string());
        let registered = outcome.is_ok();
        self.events.publish_completed(building_id, outcome).await?;
        Ok(registered)
    }
}

fn rooms(payload: &Value) -> Vec<Room> {
    payload["rooms"]
        .as_array()
        .map(|rooms| {
            rooms
                .iter()
                .filter_map(|room| {
                    let id = room["id"].as_str().filter(|id| !id.is_empty())?;
                    Some(Room {
                        id: id.to_owned(),
                        name: room["name"].as_str().unwrap_or(id).to_owned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakeBuildings, FakeEvents, FakeThresholds};
    use serde_json::json;

    struct Harness {
        buildings: Arc<FakeBuildings>,
        thresholds: Arc<FakeThresholds>,
        events: Arc<FakeEvents>,
        registration: Registration,
    }

    fn harness(buildings: FakeBuildings) -> Harness {
        let buildings = Arc::new(buildings);
        let thresholds = Arc::new(FakeThresholds::default());
        let events = Arc::new(FakeEvents::default());
        let registration = Registration {
            buildings: buildings.clone() as Arc<dyn BuildingStore>,
            thresholds: thresholds.clone() as Arc<dyn ThresholdStore>,
            events: events.clone() as Arc<dyn RegistrationEvents>,
        };
        Harness {
            buildings,
            thresholds,
            events,
            registration,
        }
    }

    fn plain() -> Harness {
        harness(FakeBuildings::default())
    }

    fn payload() -> Value {
        json!({
            "name": "HQ",
            "rooms": [{ "id": "r1", "name": "Lobby" }, { "id": "r2", "name": "Lab" }],
            "maxTemperature": 26.5
        })
    }

    #[tokio::test]
    async fn registration_persists_the_building_and_its_rooms() {
        let h = plain();
        h.registration.register("b1", &payload()).await.unwrap();
        let upserted = h.buildings.upserted.lock().unwrap();
        assert_eq!(upserted.len(), 1);
        assert_eq!(upserted[0].id, "b1");
        assert_eq!(upserted[0].name, "HQ");
        assert_eq!(upserted[0].rooms.len(), 2);
        assert_eq!(upserted[0].rooms[1].name, "Lab");
    }

    #[tokio::test]
    async fn registration_stores_max_temperature_as_a_building_temperature_bound() {
        let h = plain();
        h.registration.register("b1", &payload()).await.unwrap();
        let bounds = h
            .thresholds
            .building_bounds("b1", "temperature")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(bounds["maxTemp"], 26.5);
    }

    #[tokio::test]
    async fn registration_without_max_temperature_stores_no_bounds() {
        let h = plain();
        h.registration
            .register("b1", &json!({ "name": "HQ", "rooms": [] }))
            .await
            .unwrap();
        assert_eq!(h.buildings.upserted.lock().unwrap().len(), 1);
        assert!(h.thresholds.rows.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_room_without_an_id_is_dropped() {
        let h = plain();
        h.registration
            .register(
                "b1",
                &json!({ "name": "HQ", "rooms": [{ "name": "ghost" }, { "id": "r1" }] }),
            )
            .await
            .unwrap();
        let upserted = h.buildings.upserted.lock().unwrap();
        assert_eq!(upserted[0].rooms.len(), 1);
        assert_eq!(upserted[0].rooms[0].id, "r1");
        assert_eq!(upserted[0].rooms[0].name, "r1");
    }

    #[tokio::test]
    async fn a_payload_without_a_name_is_rejected_before_anything_is_written() {
        let h = plain();
        let error = h
            .registration
            .register("b1", &json!({ "rooms": [] }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.buildings.upserted.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_non_numeric_max_temperature_is_rejected_before_anything_is_written() {
        let h = plain();
        let error = h
            .registration
            .register("b1", &json!({ "name": "HQ", "maxTemperature": "hot" }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.buildings.upserted.lock().unwrap().is_empty());
        assert!(h.thresholds.rows.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn re_registering_the_same_building_converges() {
        let h = plain();
        h.registration.register("b1", &payload()).await.unwrap();
        h.registration.register("b1", &payload()).await.unwrap();
        assert_eq!(h.buildings.upserted.lock().unwrap().len(), 1);
        assert_eq!(h.thresholds.rows.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_registration_from_an_event_reports_ready() {
        let h = plain();
        assert!(
            h.registration
                .register_from_event("b1", &payload())
                .await
                .unwrap()
        );
        let completed = h.events.completed.lock().unwrap();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].0, "b1");
        assert!(completed[0].1.is_ok());
    }

    #[tokio::test]
    async fn a_failed_registration_reports_the_error_message() {
        let h = harness(FakeBuildings {
            refuse: true,
            ..Default::default()
        });
        assert!(
            !h.registration
                .register_from_event("b1", &payload())
                .await
                .unwrap()
        );
        let completed = h.events.completed.lock().unwrap();
        assert_eq!(
            completed[0].1.clone().unwrap_err(),
            "buildings refused".to_owned()
        );
    }
}
