use serde_json::Value;

use crate::rooms::{building_id_from_channel, room_for_building, room_for_domain};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Room(String),
    Broadcast,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Delivery {
    pub target: Target,
    pub payload: Value,
}

pub fn telemetry_delivery(channel: &str, message: &str) -> Option<Delivery> {
    let payload = serde_json::from_str(message).ok()?;

    Some(Delivery {
        target: Target::Room(room_for_building(building_id_from_channel(channel))),
        payload,
    })
}

pub fn notification_delivery(message: &str) -> Option<Delivery> {
    let payload: Value = serde_json::from_str(message).ok()?;
    let target = match payload.get("domainName").and_then(Value::as_str) {
        Some(name) if !name.is_empty() => Target::Room(room_for_domain(name)),
        _ => Target::Broadcast,
    };

    Some(Delivery { target, payload })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn telemetry_goes_to_the_room_of_the_channels_building() {
        let delivery = telemetry_delivery("telemetry:filtered:b1", r#"{"value":21}"#).unwrap();
        assert_eq!(delivery.target, Target::Room(room_for_building("b1")));
        assert_eq!(delivery.payload, json!({"value": 21}));
    }

    #[test]
    fn malformed_telemetry_is_skipped() {
        assert_eq!(telemetry_delivery("telemetry:filtered:b1", "{oops"), None);
    }

    #[test]
    fn a_scoped_notification_goes_to_its_domain_room() {
        let delivery = notification_delivery(r#"{"message":"hi","domainName":"acme"}"#).unwrap();
        assert_eq!(delivery.target, Target::Room(room_for_domain("acme")));
        assert_eq!(
            delivery.payload,
            json!({"message": "hi", "domainName": "acme"})
        );
    }

    #[test]
    fn an_unscoped_notification_is_broadcast() {
        let delivery = notification_delivery(r#"{"message":"hi"}"#).unwrap();
        assert_eq!(delivery.target, Target::Broadcast);
    }

    #[test]
    fn a_null_domain_name_is_broadcast() {
        let delivery = notification_delivery(r#"{"message":"hi","domainName":null}"#).unwrap();
        assert_eq!(delivery.target, Target::Broadcast);
    }

    #[test]
    fn an_empty_domain_name_is_broadcast() {
        let delivery = notification_delivery(r#"{"message":"hi","domainName":""}"#).unwrap();
        assert_eq!(delivery.target, Target::Broadcast);
    }

    #[test]
    fn malformed_notification_is_skipped() {
        assert_eq!(notification_delivery("{oops"), None);
    }
}
