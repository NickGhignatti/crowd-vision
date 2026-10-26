use notification_schema::Notification;
use serde_json::Value;
use twin_schema::{Devices, building_of_devices_channel};

use crate::core::rooms::{building_id_from_channel, room_for_building, room_for_domain};

/// A payload and the one room it goes to; nothing is ever sent to every client.
#[derive(Debug, Clone, PartialEq)]
pub struct Delivery {
    pub room: String,
    pub payload: Value,
}

pub fn get_telemetry_delivery_plan(channel: &str, message: &str) -> Option<Delivery> {
    let payload = serde_json::from_str(message).ok()?;

    Some(Delivery {
        room: room_for_building(building_id_from_channel(channel)),
        payload,
    })
}

pub fn get_notification_delivery_plan(message: &str) -> Option<Delivery> {
    let notification: Notification = serde_json::from_str(message).ok()?;

    Some(Delivery {
        room: room_for_domain(&notification.domain_name),
        payload: serde_json::from_str(message).ok()?,
    })
}

/// Routes a building's devices by their channel, only if the body is a `Devices` for that building.
pub fn get_devices_delivery_plan(channel: &str, message: &str) -> Option<Delivery> {
    let building_id = building_of_devices_channel(channel)?;
    let devices: Devices = serde_json::from_str(message).ok()?;
    if devices.building_id != building_id {
        return None;
    }

    Some(Delivery {
        room: room_for_building(building_id),
        payload: serde_json::from_str(message).ok()?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn telemetry_goes_to_the_room_of_the_channels_building() {
        let delivery =
            get_telemetry_delivery_plan("telemetry:filtered:b1", r#"{"value":21}"#).unwrap();
        assert_eq!(delivery.room, room_for_building("b1"));
        assert_eq!(delivery.payload, json!({"value": 21}));
    }

    #[test]
    fn malformed_telemetry_is_skipped() {
        assert_eq!(
            get_telemetry_delivery_plan("telemetry:filtered:b1", "{oops"),
            None
        );
    }

    const WIRE: &str = include_str!("../../../../schemas/fixtures/notification.json");

    fn wire(group: &str, name: &str) -> Value {
        let wire: Value = serde_json::from_str(WIRE).unwrap();
        let cases = wire[group].as_array().unwrap();
        cases.iter().find(|c| c["name"] == name).unwrap()["body"].clone()
    }

    #[test]
    fn a_scoped_notification_goes_to_its_domain_room_unchanged() {
        let body = wire("cases", "temperature breach, scoped to its domain");
        let delivery = get_notification_delivery_plan(&body.to_string()).unwrap();
        assert_eq!(delivery.room, room_for_domain("eng"));
        assert_eq!(delivery.payload, body);
    }

    #[test]
    fn a_notification_with_no_domain_is_skipped_never_broadcast() {
        for name in ["no domainName", "an empty domainName"] {
            let body = wire("rejected", name);
            assert_eq!(
                get_notification_delivery_plan(&body.to_string()),
                None,
                "{name}"
            );
        }
        let mut body = wire("cases", "temperature breach, scoped to its domain");
        body["domainName"] = Value::Null;
        assert_eq!(get_notification_delivery_plan(&body.to_string()), None);
    }

    #[test]
    fn malformed_notification_is_skipped() {
        assert_eq!(get_notification_delivery_plan("{oops"), None);
    }

    #[test]
    fn a_message_the_producer_never_writes_is_skipped_not_broadcast() {
        assert_eq!(
            get_notification_delivery_plan(r#"{"message":"hi","domainName":"acme"}"#),
            None
        );
        for name in [
            "a type outside the closed set",
            "no title",
            "an epoch-millisecond timestamp",
        ] {
            let body = wire("rejected", name);
            assert_eq!(
                get_notification_delivery_plan(&body.to_string()),
                None,
                "{name}"
            );
        }
    }

    const DEVICES: &str = include_str!("../../../../schemas/fixtures/devices.json");

    fn devices(group: &str) -> Vec<Value> {
        let wire: Value = serde_json::from_str(DEVICES).unwrap();
        wire[group].as_array().unwrap().clone()
    }

    #[test]
    fn devices_go_to_the_room_of_their_building_unchanged() {
        for case in devices("cases") {
            let body = &case["body"];
            let channel = format!("twin:devices:{}", body["buildingId"].as_str().unwrap());

            let delivery = get_devices_delivery_plan(&channel, &body.to_string())
                .unwrap_or_else(|| panic!("{} skipped", case["name"]));

            assert_eq!(delivery.room, room_for_building("bldg-3f2b4c5d"));
            assert_eq!(&delivery.payload, body);
        }
    }

    #[test]
    fn devices_the_contract_refuses_are_skipped() {
        for case in devices("rejected") {
            let body = &case["body"];
            assert_eq!(
                get_devices_delivery_plan("twin:devices:bldg-3f2b4c5d", &body.to_string()),
                None,
                "{}",
                case["name"]
            );
        }
    }

    // The room comes from the channel; a body naming another building means twin sent it astray.
    #[test]
    fn devices_naming_another_building_than_their_channel_are_skipped() {
        let body = devices("cases")[0]["body"].to_string();

        assert_eq!(get_devices_delivery_plan("twin:devices:other", &body), None);
        assert_eq!(
            get_devices_delivery_plan("telemetry:filtered:bldg-3f2b4c5d", &body),
            None
        );
    }
}
