use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

pub const BUILDING_REGISTRATION_REQUESTED_TOPIC: &str = "building-registration-requested";
pub const BUILDING_REGISTRATION_COMPLETED_TOPIC: &str = "building-registration-completed";

pub const STATUS_READY: &str = "ready";
pub const STATUS_FAILED: &str = "failed";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegistrationRoom {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub building_id: Option<String>,
    #[serde(default)]
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_temperature: Option<f64>,
    #[serde(default, deserialize_with = "usable_rooms")]
    pub rooms: Vec<RegistrationRoom>,
}

fn usable_rooms<'de, D>(deserializer: D) -> Result<Vec<RegistrationRoom>, D::Error>
where
    D: Deserializer<'de>,
{
    let entries = Option::<Vec<Value>>::deserialize(deserializer)?.unwrap_or_default();
    Ok(entries
        .into_iter()
        .filter_map(|entry| {
            let id = entry.get("id")?.as_str().filter(|id| !id.is_empty())?;
            let name = entry
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty())
                .unwrap_or(id);
            Some(RegistrationRoom {
                id: id.to_owned(),
                name: name.to_owned(),
            })
        })
        .collect())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationCompleted {
    pub building_id: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl RegistrationCompleted {
    pub fn ready(building_id: &str) -> Self {
        Self {
            building_id: building_id.to_owned(),
            status: STATUS_READY.to_owned(),
            error: None,
        }
    }

    pub fn failed(building_id: &str, error: &str) -> Self {
        Self {
            building_id: building_id.to_owned(),
            status: STATUS_FAILED.to_owned(),
            error: Some(error.to_owned()),
        }
    }

    pub fn is_ready(&self) -> bool {
        self.status == STATUS_READY
    }

    pub fn failure(&self) -> Option<String> {
        (!self.is_ready()).then(|| self.error.clone().unwrap_or_else(|| self.status.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request(raw: serde_json::Value) -> RegistrationRequest {
        serde_json::from_value(raw).expect("payload parses")
    }

    #[test]
    fn the_request_wire_shape_is_camel_case() {
        let encoded = serde_json::to_value(RegistrationRequest {
            building_id: Some("b1".to_string()),
            name: "HQ".to_string(),
            max_temperature: Some(26.5),
            rooms: vec![RegistrationRoom {
                id: "r1".to_string(),
                name: "Lobby".to_string(),
            }],
        })
        .unwrap();

        assert_eq!(
            encoded,
            json!({
                "buildingId": "b1",
                "name": "HQ",
                "maxTemperature": 26.5,
                "rooms": [{ "id": "r1", "name": "Lobby" }],
            }),
        );
    }

    #[test]
    fn what_the_producer_publishes_today_still_parses() {
        let parsed = request(json!({
            "buildingId": "b1",
            "name": "HQ",
            "rooms": [{ "id": "r1", "name": "Lobby" }, { "id": "r2", "name": "Lab" }],
        }));

        assert_eq!(parsed.building_id.as_deref(), Some("b1"));
        assert_eq!(parsed.name, "HQ");
        assert_eq!(parsed.max_temperature, None);
        assert_eq!(parsed.rooms.len(), 2);
        assert_eq!(parsed.rooms[1].name, "Lab");
    }

    #[test]
    fn a_room_without_an_id_is_dropped_and_one_without_a_name_takes_its_id() {
        let parsed = request(json!({
            "name": "HQ",
            "rooms": [{ "name": "ghost" }, { "id": "" }, "r0", { "id": "r1" }],
        }));

        assert_eq!(
            parsed.rooms,
            vec![RegistrationRoom {
                id: "r1".to_string(),
                name: "r1".to_string(),
            }],
        );
    }

    #[test]
    fn absent_rooms_and_an_absent_name_are_empty_not_an_error() {
        let parsed = request(json!({ "buildingId": "b1" }));
        assert_eq!(parsed.name, "");
        assert!(parsed.rooms.is_empty());
    }

    #[test]
    fn a_max_temperature_that_is_not_a_number_is_rejected() {
        let error =
            serde_json::from_value::<RegistrationRequest>(json!({ "maxTemperature": "hot" }))
                .unwrap_err();
        assert!(error.to_string().contains("hot"));
    }

    #[test]
    fn a_ready_completion_carries_no_error() {
        let event = RegistrationCompleted::ready("b1");
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            json!({ "buildingId": "b1", "status": "ready" }),
        );
        assert!(event.is_ready());
        assert_eq!(event.failure(), None);
    }

    #[test]
    fn a_failed_completion_carries_the_reason() {
        let event = RegistrationCompleted::failed("b1", "name: must be a non-empty string.");
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            json!({
                "buildingId": "b1",
                "status": "failed",
                "error": "name: must be a non-empty string.",
            }),
        );
        assert_eq!(
            event.failure().as_deref(),
            Some("name: must be a non-empty string.")
        );
    }

    #[test]
    fn an_unrecognised_status_reads_as_a_failure_named_after_itself() {
        let event: RegistrationCompleted =
            serde_json::from_value(json!({ "buildingId": "b1", "status": "exploded" })).unwrap();
        assert!(!event.is_ready());
        assert_eq!(event.failure().as_deref(), Some("exploded"));
    }

    #[test]
    fn what_the_producer_writes_is_what_the_consumer_reads() {
        for event in [
            RegistrationCompleted::ready("b1"),
            RegistrationCompleted::failed("b1", "boom"),
        ] {
            let encoded = serde_json::to_string(&event).unwrap();
            assert_eq!(
                serde_json::from_str::<RegistrationCompleted>(&encoded).unwrap(),
                event
            );
        }
    }
}
