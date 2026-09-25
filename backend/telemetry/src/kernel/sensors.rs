use crate::kernel::devices::DeviceCatalog;
use crate::kernel::ports::{BuildingStore, SensorStore};
use crate::types::error::{DomainError, ItemError};
use crate::types::sensor::{Sensor, SensorChanges, SensorUpdate};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

pub const MAX_BATCH_SENSORS: usize = 200;

pub struct Sensors {
    pub devices: Arc<DeviceCatalog>,
    pub store: Arc<dyn SensorStore>,
    pub buildings: Arc<dyn BuildingStore>,
}

/// The server-generated id given to the create item the client tagged `reference`.
#[derive(Debug, Clone, PartialEq)]
pub struct Created {
    pub reference: String,
    pub sensor_id: String,
}

impl Sensors {
    /// Applies one building's creates, updates and deletes all-or-nothing.
    pub async fn apply(
        &self,
        building_id: &str,
        payload: &Value,
    ) -> Result<Vec<Created>, DomainError> {
        let body = payload
            .as_object()
            .ok_or_else(|| validation("body: must be an object."))?;
        let (creates, updates, deletes) = (
            items(body, "create")?,
            items(body, "update")?,
            items(body, "delete")?,
        );
        if creates.len() + updates.len() + deletes.len() > MAX_BATCH_SENSORS {
            return Err(validation(&format!(
                "batch: must not exceed {MAX_BATCH_SENSORS} sensors."
            )));
        }
        let refs = creates
            .iter()
            .map(|item| field(item, "ref"))
            .collect::<Result<Vec<_>, _>>()?;
        let update_ids = updates
            .iter()
            .map(|item| field(item, "sensorId"))
            .collect::<Result<Vec<_>, _>>()?;
        let delete_ids = deletes
            .iter()
            .map(|id| {
                non_empty(id).ok_or_else(|| validation("delete: every item must be a sensor id."))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if refs.is_empty() && update_ids.is_empty() && delete_ids.is_empty() {
            return Ok(Vec::new());
        }

        let rooms = self
            .buildings
            .names_of(building_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound(format!("building {building_id} is not registered."))
            })?
            .rooms;
        let known: HashSet<String> = self
            .store
            .by_building(building_id)
            .await?
            .into_iter()
            .map(|sensor| sensor.sensor_id)
            .collect();

        let mut errors = Vec::new();
        let mut changes = SensorChanges::default();
        let mut created = Vec::new();

        let mut seen_refs = HashSet::new();
        for (item, reference) in creates.iter().zip(refs) {
            let before = errors.len();
            let mut reject = |field: &str, message: &str| {
                errors.push(item_error(&reference, field, message));
            };
            if !seen_refs.insert(reference.clone()) {
                reject("ref", "must be unique within the batch.");
                continue;
            }
            let name = optional(item, "name");
            if name.is_none() {
                reject("name", "must be a non-empty string.");
            }
            let sensor_type =
                optional(item, "sensorType").filter(|kind| self.devices.get(kind).is_some());
            if sensor_type.is_none() {
                reject("sensorType", "must be a registered device kind.");
            }
            let room_id = room(item, &rooms).unwrap_or_else(|message| {
                reject("roomId", message);
                None
            });
            if let (true, Some(name), Some(sensor_type)) =
                (errors.len() == before, name, sensor_type)
            {
                let sensor_id = uuid::Uuid::new_v4().to_string();
                created.push(Created {
                    reference,
                    sensor_id: sensor_id.clone(),
                });
                changes.create.push(Sensor {
                    building_id: building_id.to_owned(),
                    room_id,
                    sensor_id,
                    name,
                    sensor_type,
                    driver: optional(item, "driver"),
                    endpoint: optional(item, "endpoint"),
                });
            }
        }

        let mut touched = HashSet::new();
        for (item, sensor_id) in updates.iter().zip(update_ids) {
            let before = errors.len();
            target(&known, &mut touched, &sensor_id, &mut errors);
            let name = item.get("name").map(|_| optional(item, "name"));
            if name == Some(None) {
                errors.push(item_error(
                    &sensor_id,
                    "name",
                    "must be a non-empty string.",
                ));
            }
            let room_id = item.get("roomId").map(|_| {
                room(item, &rooms).unwrap_or_else(|message| {
                    errors.push(item_error(&sensor_id, "roomId", message));
                    None
                })
            });
            if errors.len() == before {
                changes.update.push(SensorUpdate {
                    sensor_id,
                    name: name.flatten(),
                    room_id,
                });
            }
        }
        for sensor_id in delete_ids {
            if target(&known, &mut touched, &sensor_id, &mut errors) {
                changes.delete.push(sensor_id);
            }
        }

        if !errors.is_empty() {
            return Err(DomainError::Rejected(errors));
        }
        self.store.apply(building_id, &changes).await?;
        Ok(created)
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

/// Whether `sensor_id` is this building's and not already changed by the batch; records why not.
fn target(
    known: &HashSet<String>,
    touched: &mut HashSet<String>,
    sensor_id: &str,
    errors: &mut Vec<ItemError>,
) -> bool {
    let message = if !known.contains(sensor_id) {
        "must be a sensor of this building."
    } else if !touched.insert(sensor_id.to_owned()) {
        "must appear once per batch."
    } else {
        return true;
    };
    errors.push(item_error(sensor_id, "sensorId", message));
    false
}

/// `null` or absent means outdoors.
fn room(item: &Value, rooms: &HashMap<String, String>) -> Result<Option<String>, &'static str> {
    match item.get("roomId") {
        None | Some(Value::Null) => Ok(None),
        Some(value) => non_empty(value)
            .filter(|id| rooms.contains_key(id))
            .map(Some)
            .ok_or("must be null or a room of this building."),
    }
}

fn items<'a>(body: &'a Map<String, Value>, name: &str) -> Result<&'a [Value], DomainError> {
    match body.get(name) {
        None => Ok(&[]),
        Some(Value::Array(items)) => Ok(items),
        Some(_) => Err(validation(&format!("{name}: must be an array."))),
    }
}

fn item_error(reference: &str, field: &str, message: &str) -> ItemError {
    ItemError {
        reference: reference.to_owned(),
        field: field.to_owned(),
        message: message.to_owned(),
    }
}

fn validation(message: &str) -> DomainError {
    DomainError::Validation(message.to_owned())
}

fn non_empty(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn optional(data: &Value, name: &str) -> Option<String> {
    non_empty(&data[name])
}

fn field(data: &Value, name: &str) -> Result<String, DomainError> {
    optional(data, name).ok_or_else(|| validation(&format!("{name}: must be a non-empty string.")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakeBuildings, FakePlugin, FakeSensors};
    use crate::kernel::registry::PluginRegistry;
    use crate::types::building::{RegisteredBuilding, Room};
    use crate::types::device::DeviceKind;
    use crate::types::error::ItemError;
    use serde_json::json;

    struct Harness {
        store: Arc<FakeSensors>,
        sensors: Sensors,
    }

    fn harness(store: FakeSensors) -> Harness {
        let store = Arc::new(store);
        let buildings = FakeBuildings::default();
        buildings.upserted.lock().unwrap().push(RegisteredBuilding {
            id: "b1".to_owned(),
            name: "HQ".to_owned(),
            rooms: ["r1", "r2"]
                .map(|id| Room {
                    id: id.to_owned(),
                    name: id.to_owned(),
                })
                .to_vec(),
        });
        let registry =
            Arc::new(PluginRegistry::new(vec![Box::new(FakePlugin::default())]).unwrap());
        let devices = Arc::new(
            DeviceCatalog::new(
                vec![DeviceKind {
                    key: "fakeDevice",
                    label: "Fake device",
                    metrics: &["fake"],
                }],
                &registry,
            )
            .unwrap(),
        );
        let sensors = Sensors {
            devices,
            store: store.clone() as Arc<dyn SensorStore>,
            buildings: Arc::new(buildings),
        };
        Harness { store, sensors }
    }

    fn plain() -> Harness {
        harness(FakeSensors::default())
    }

    fn stored(h: &Harness) -> Vec<Sensor> {
        h.store.registered.lock().unwrap().clone()
    }

    fn rejected(error: DomainError) -> Vec<ItemError> {
        match error {
            DomainError::Rejected(items) => items,
            other => panic!("expected Rejected, got {other:?}"),
        }
    }

    fn create(reference: &str, room: Value) -> Value {
        json!({ "ref": reference, "name": format!("Sensor {reference}"), "sensorType": "fakeDevice", "roomId": room })
    }

    async fn seeded(h: &Harness) -> Vec<Created> {
        h.sensors
            .apply(
                "b1",
                &json!({ "create": [create("d1", json!("r1")), create("d2", json!(null))] }),
            )
            .await
            .unwrap()
    }

    fn id_of(created: &[Created], reference: &str) -> String {
        created
            .iter()
            .find(|c| c.reference == reference)
            .unwrap()
            .sensor_id
            .clone()
    }

    #[tokio::test]
    async fn created_sensors_get_fresh_server_generated_ids() {
        let h = plain();
        let created = seeded(&h).await;
        let refs: Vec<_> = created.iter().map(|c| c.reference.as_str()).collect();
        assert_eq!(refs, ["d1", "d2"]);
        assert_ne!(created[0].sensor_id, created[1].sensor_id);
        for c in &created {
            assert!(uuid::Uuid::parse_str(&c.sensor_id).is_ok());
        }
        let ids: Vec<_> = stored(&h).into_iter().map(|s| s.sensor_id).collect();
        assert_eq!(ids, [id_of(&created, "d1"), id_of(&created, "d2")]);
    }

    #[tokio::test]
    async fn a_client_supplied_sensor_id_is_ignored() {
        let h = plain();
        let mut item = create("d1", json!("r1"));
        item["sensorId"] = json!("chosen-by-client");
        let created = h
            .sensors
            .apply("b1", &json!({ "create": [item] }))
            .await
            .unwrap();
        assert_ne!(created[0].sensor_id, "chosen-by-client");
    }

    #[tokio::test]
    async fn a_created_sensor_keeps_its_name_type_and_room() {
        let h = plain();
        seeded(&h).await;
        let sensors = stored(&h);
        assert_eq!(sensors[0].building_id, "b1");
        assert_eq!(sensors[0].name, "Sensor d1");
        assert_eq!(sensors[0].sensor_type, "fakeDevice");
        assert_eq!(sensors[0].room_id.as_deref(), Some("r1"));
        assert_eq!(sensors[1].room_id, None);
    }

    #[tokio::test]
    async fn a_metric_is_not_a_device_kind() {
        let h = plain();
        let mut item = create("d1", json!("r1"));
        item["sensorType"] = json!("fake");
        let error = h
            .sensors
            .apply("b1", &json!({ "create": [item] }))
            .await
            .unwrap_err();
        let errors = rejected(error);
        assert_eq!(
            (errors[0].reference.as_str(), errors[0].field.as_str()),
            ("d1", "sensorType")
        );
    }

    #[tokio::test]
    async fn every_invalid_item_is_reported_and_nothing_is_stored() {
        let h = plain();
        let mut blank_name = create("d1", json!("r1"));
        blank_name["name"] = json!("  ");
        let mut unknown_type = create("d2", json!("r1"));
        unknown_type["sensorType"] = json!("humidity");
        let unknown_room = create("d3", json!("r9"));
        let valid = create("d4", json!("r1"));

        let error = h
            .sensors
            .apply(
                "b1",
                &json!({ "create": [blank_name, unknown_type, unknown_room, valid] }),
            )
            .await
            .unwrap_err();

        let errors: Vec<_> = rejected(error)
            .into_iter()
            .map(|e| (e.reference, e.field))
            .collect();
        assert_eq!(
            errors,
            [
                ("d1".to_owned(), "name".to_owned()),
                ("d2".to_owned(), "sensorType".to_owned()),
                ("d3".to_owned(), "roomId".to_owned()),
            ]
        );
        assert!(stored(&h).is_empty());
    }

    #[tokio::test]
    async fn a_repeated_ref_is_rejected() {
        let h = plain();
        let error = h
            .sensors
            .apply(
                "b1",
                &json!({ "create": [create("d1", json!("r1")), create("d1", json!("r2"))] }),
            )
            .await
            .unwrap_err();
        assert_eq!(rejected(error)[0].field, "ref");
        assert!(stored(&h).is_empty());
    }

    #[tokio::test]
    async fn an_unknown_building_is_not_found() {
        let h = plain();
        let error = h
            .sensors
            .apply("b9", &json!({ "create": [create("d1", json!(null))] }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
    }

    #[tokio::test]
    async fn an_update_renames_and_moves_a_sensor() {
        let h = plain();
        let id = id_of(&seeded(&h).await, "d1");
        h.sensors
            .apply(
                "b1",
                &json!({ "update": [{ "sensorId": id, "name": "Renamed", "roomId": "r2" }] }),
            )
            .await
            .unwrap();
        let sensor = stored(&h).into_iter().find(|s| s.sensor_id == id).unwrap();
        assert_eq!(sensor.name, "Renamed");
        assert_eq!(sensor.room_id.as_deref(), Some("r2"));
    }

    #[tokio::test]
    async fn a_null_room_moves_a_sensor_outdoors_and_an_absent_one_keeps_it() {
        let h = plain();
        let created = seeded(&h).await;
        let (outdoors, kept) = (id_of(&created, "d1"), id_of(&created, "d2"));
        h.sensors
            .apply(
                "b1",
                &json!({ "update": [
                    { "sensorId": outdoors, "roomId": null },
                    { "sensorId": kept, "name": "Only renamed" },
                ] }),
            )
            .await
            .unwrap();
        let sensors = stored(&h);
        let find = |id: &str| sensors.iter().find(|s| s.sensor_id == id).unwrap();
        assert_eq!(find(&outdoors).room_id, None);
        assert_eq!(find(&outdoors).name, "Sensor d1");
        assert_eq!(find(&kept).room_id, None);
        assert_eq!(find(&kept).name, "Only renamed");
    }

    #[tokio::test]
    async fn a_delete_removes_the_sensor() {
        let h = plain();
        let created = seeded(&h).await;
        h.sensors
            .apply("b1", &json!({ "delete": [id_of(&created, "d1")] }))
            .await
            .unwrap();
        let ids: Vec<_> = stored(&h).into_iter().map(|s| s.sensor_id).collect();
        assert_eq!(ids, [id_of(&created, "d2")]);
    }

    #[tokio::test]
    async fn updating_or_deleting_an_unknown_sensor_is_rejected() {
        let h = plain();
        let error = h
            .sensors
            .apply(
                "b1",
                &json!({ "update": [{ "sensorId": "ghost", "name": "x" }], "delete": ["ghost"] }),
            )
            .await
            .unwrap_err();
        let errors = rejected(error);
        assert_eq!(errors.len(), 2);
        assert!(
            errors
                .iter()
                .all(|e| e.reference == "ghost" && e.field == "sensorId")
        );
    }

    #[tokio::test]
    async fn a_sensor_of_another_building_counts_as_unknown() {
        let h = plain();
        h.store.registered.lock().unwrap().push(Sensor {
            building_id: "b2".to_owned(),
            room_id: None,
            sensor_id: "foreign".to_owned(),
            name: "Foreign".to_owned(),
            sensor_type: "fakeDevice".to_owned(),
            driver: None,
            endpoint: None,
        });
        let error = h
            .sensors
            .apply("b1", &json!({ "delete": ["foreign"] }))
            .await
            .unwrap_err();
        assert_eq!(rejected(error)[0].reference, "foreign");
        assert_eq!(stored(&h).len(), 1);
    }

    #[tokio::test]
    async fn a_sensor_named_twice_in_one_batch_is_rejected() {
        let h = plain();
        let id = id_of(&seeded(&h).await, "d1");
        let error = h
            .sensors
            .apply(
                "b1",
                &json!({ "update": [{ "sensorId": id, "name": "x" }], "delete": [id] }),
            )
            .await
            .unwrap_err();
        assert_eq!(rejected(error)[0].reference, id);
        assert_eq!(stored(&h).len(), 2);
    }

    #[tokio::test]
    async fn a_batch_over_the_limit_is_a_validation_error() {
        let h = plain();
        let items: Vec<_> = (0..=MAX_BATCH_SENSORS)
            .map(|i| create(&format!("d{i}"), json!(null)))
            .collect();
        let error = h
            .sensors
            .apply("b1", &json!({ "create": items }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(stored(&h).is_empty());
    }

    #[tokio::test]
    async fn a_malformed_batch_is_a_validation_error() {
        let h = plain();
        for body in [
            json!("x"),
            json!({ "create": {} }),
            json!({ "create": [{ "name": "no ref", "sensorType": "fakeDevice" }] }),
            json!({ "update": [{ "name": "no id" }] }),
            json!({ "delete": [42] }),
        ] {
            let error = h.sensors.apply("b1", &body).await.unwrap_err();
            assert!(
                matches!(error, DomainError::Validation(_)),
                "{body} gave {error:?}"
            );
        }
        assert!(stored(&h).is_empty());
    }

    #[tokio::test]
    async fn an_empty_batch_changes_nothing() {
        let h = plain();
        assert!(h.sensors.apply("b1", &json!({})).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_store_failure_is_internal() {
        let h = harness(FakeSensors {
            refuse: true,
            ..Default::default()
        });
        let error = h
            .sensors
            .apply("b1", &json!({ "create": [create("d1", json!(null))] }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Internal(_)));
    }

    #[tokio::test]
    async fn sensors_are_listed_by_building_and_by_room() {
        let h = plain();
        seeded(&h).await;
        assert_eq!(h.sensors.by_building("b1").await.unwrap().len(), 2);
        assert_eq!(h.sensors.by_room("b1", "r1").await.unwrap().len(), 1);
        assert!(h.sensors.by_building("b2").await.unwrap().is_empty());
    }
}
