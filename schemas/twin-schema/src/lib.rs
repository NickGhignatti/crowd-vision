use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

pub const BUILDING_REGISTRATION_REQUESTED_TOPIC: &str = "building-registration-requested";
pub const BUILDING_REGISTRATION_COMPLETED_TOPIC: &str = "building-registration-completed";

pub const STATUS_READY: &str = "ready";
pub const STATUS_FAILED: &str = "failed";

pub const WIFI_OBSERVATIONS_TOPIC: &str = "wifi-observations";
pub const ESTIMATED_OCCUPANCY_TOPIC: &str = "estimated-occupancy";

pub const DEVICES_CHANNEL_PREFIX: &str = "twin:devices:";
pub const DEVICES_CHANNEL_PATTERN: &str = "twin:devices:*";

/// The Redis channel carrying one building's estimated devices.
pub fn devices_channel(building_id: &str) -> String {
    format!("{DEVICES_CHANNEL_PREFIX}{building_id}")
}

/// The building a devices channel belongs to; `None` for any other channel.
pub fn building_of_devices_channel(channel: &str) -> Option<&str> {
    channel
        .strip_prefix(DEVICES_CHANNEL_PREFIX)
        .filter(|building_id| !building_id.is_empty())
}

/// One building's estimated devices from one Wi-Fi tick; an empty list clears the building.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Devices {
    pub building_id: String,
    pub tick: u64,
    pub devices: Vec<Device>,
}

/// Connected devices per room, placed by position from one Wi-Fi tick. Counts only, no positions.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EstimatedOccupancy {
    pub building_id: String,
    pub tick: u64,
    pub rooms: BTreeMap<String, u64>,
}

/// One person's estimated place. No token: a device carries nothing that follows a phone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Device {
    pub floor: usize,
    pub room: String,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    /// One spread of the position, in metres along each axis.
    pub radius: f64,
    /// False for a burst no connected phone explains: someone passing who never joined.
    pub connected: bool,
}

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

// Together they keep a tick of UUID router ids under telemetry's 1 MiB body limit.
pub const MAX_CONNECTED: usize = 2000;
pub const MAX_BURSTS: usize = 2000;
pub const MAX_HEARD: usize = 6;
pub const MIN_SIGNAL: i32 = -127;

/// One building tick from ap-collector: random tokens in place of addresses, no coordinates.
// Unknown fields are refused: telemetry republishes the received bytes, so a stray `mac` would travel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WifiObservations {
    pub building_id: String,
    pub tick: u64,
    /// Routers that replied; one missing here failed, so its phones are unknown, not gone.
    pub answered: Vec<String>,
    pub connected: Vec<ConnectedPhone>,
    pub bursts: Vec<ProbeBurst>,
    /// The site's phones-per-person factor; absent, no room gets a people estimate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub devices_per_person: Option<f64>,
}

/// A connected phone as one router lists it; one token on two rows is one phone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConnectedPhone {
    pub token: String,
    pub router: String,
    pub signal: i32,
}

/// One scan: each router that heard it, with its loudest frame in dBm.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProbeBurst {
    pub token: String,
    pub started: u64,
    pub heard: BTreeMap<String, i32>,
}

impl WifiObservations {
    /// Every contract rule serde cannot check, one message each; empty when the tick is sound.
    pub fn problems(&self) -> Vec<String> {
        let mut problems = Vec::new();
        if self.building_id.is_empty() {
            problems.push("buildingId: must not be empty.".to_owned());
        }
        let mut answered = BTreeSet::new();
        for router in &self.answered {
            if router.is_empty() || !answered.insert(router) {
                problems.push(format!(
                    "answered: {router:?} must be a router id, listed once."
                ));
            }
        }
        if self
            .devices_per_person
            .is_some_and(|factor| !(factor.is_finite() && factor > 0.0))
        {
            problems.push("devicesPerPerson: must be above 0.".to_owned());
        }
        if self.connected.len() > MAX_CONNECTED {
            problems.push(format!("connected: at most {MAX_CONNECTED} rows."));
        }
        if self.bursts.len() > MAX_BURSTS {
            problems.push(format!("bursts: at most {MAX_BURSTS}."));
        }
        for (index, phone) in self.connected.iter().enumerate() {
            if !is_token(&phone.token) || !is_heard(&phone.router, phone.signal) {
                problems.push(format!(
                    "connected[{index}]: needs a token of 16 lowercase hex digits, a router \
                     and a signal from {MIN_SIGNAL} to 0 dBm."
                ));
            }
        }
        for (index, burst) in self.bursts.iter().enumerate() {
            let heard = (1..=MAX_HEARD).contains(&burst.heard.len())
                && burst
                    .heard
                    .iter()
                    .all(|(router, signal)| is_heard(router, *signal));
            if !is_token(&burst.token) || !heard {
                problems.push(format!(
                    "bursts[{index}]: needs a token of 16 lowercase hex digits and 1 to \
                     {MAX_HEARD} routers, each with a signal from {MIN_SIGNAL} to 0 dBm."
                ));
            }
        }
        problems
    }
}

fn is_token(token: &str) -> bool {
    token.len() == 16
        && token
            .bytes()
            .all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn is_heard(router: &str, signal: i32) -> bool {
    !router.is_empty() && (MIN_SIGNAL..=0).contains(&signal)
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

    #[test]
    fn a_building_round_trips_through_its_own_devices_channel() {
        for building_id in ["b1", "site:b1"] {
            let channel = devices_channel(building_id);
            assert_eq!(channel, format!("twin:devices:{building_id}"));
            assert_eq!(building_of_devices_channel(&channel), Some(building_id));
        }
    }

    #[test]
    fn a_channel_that_is_not_a_devices_channel_names_no_building() {
        for channel in ["notifications", "telemetry:filtered:b1", "twin:devices:"] {
            assert_eq!(building_of_devices_channel(channel), None, "{channel}");
        }
    }
}
