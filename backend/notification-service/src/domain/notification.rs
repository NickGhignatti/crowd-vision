use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use time::format_description::BorrowedFormatItem;
use time::macros::format_description;

pub const NOTIFICATIONS_CHANNEL: &str = "notifications";
pub const ALERTS_TEMPERATURE_CHANNEL: &str = "alerts:temperature";
pub const COOLDOWN_SECONDS: u64 = 300;

const JS_ISO: &[BorrowedFormatItem] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z");

pub fn iso8601(millis: i64) -> String {
    OffsetDateTime::from_unix_timestamp_nanos(millis as i128 * 1_000_000)
        .expect("millisecond timestamps are in range")
        .format(JS_ISO)
        .expect("format is total over valid datetimes")
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub message: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub timestamp: String,
    #[serde(rename = "domainName", skip_serializing_if = "Option::is_none")]
    pub domain_name: Option<String>,
}

impl Notification {
    pub fn new(
        id_millis: i64,
        at_millis: i64,
        message: impl Into<String>,
        kind: impl Into<String>,
        domain_name: Option<String>,
    ) -> Self {
        Notification {
            id: id_millis.to_string(),
            message: message.into(),
            kind: kind.into(),
            timestamp: iso8601(at_millis),
            domain_name: domain_name.filter(|d| !d.is_empty()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PushPayload {
    pub title: String,
    pub message: String,
    pub icon: String,
}

impl PushPayload {
    pub fn new(title: Option<&str>, message: Option<&str>, icon: Option<&str>) -> Self {
        PushPayload {
            title: or_default(title, "CrowdVision Alert"),
            message: or_default(message, "New system update."),
            icon: or_default(icon, "/favicon.ico"),
        }
    }
}

fn or_default(value: Option<&str>, fallback: &str) -> String {
    value
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

#[derive(Debug, Clone, Deserialize)]
pub struct TemperatureAlert {
    #[serde(rename = "buildingId", default)]
    pub building_id: Option<String>,
    #[serde(rename = "roomId", default)]
    pub room_id: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub timestamp: Option<i64>,
}

impl TemperatureAlert {
    pub fn message(&self) -> String {
        let breach = match self.direction.as_deref() {
            Some("high") => " (above maximum)",
            Some("low") => " (below minimum)",
            _ => "",
        };
        format!(
            "{} : {} is {}°C{breach}",
            js_str(&self.building_id),
            js_str(&self.room_id),
            js_num(self.temperature),
        )
    }

    pub fn cooldown_key(&self) -> String {
        temperature_cooldown_key(self.building_id.as_deref(), self.room_id.as_deref())
    }

    pub fn push_title(&self) -> String {
        manual_push_title(self.building_id.as_deref())
    }
}

/// The `POST /push/temperature` body: same breach, but with a caller-supplied
/// domain that short-circuits the building lookup.
#[derive(Debug, Clone, Default)]
pub struct ManualTemperatureAlert {
    pub building_id: Option<String>,
    pub room_id: Option<String>,
    pub temperature: Option<f64>,
    pub domain_name: Option<String>,
    pub notification_type: Option<String>,
}

impl ManualTemperatureAlert {
    pub fn message(&self) -> String {
        manual_temperature_message(self.room_id.as_deref(), self.temperature)
    }

    pub fn cooldown_key(&self) -> String {
        temperature_cooldown_key(self.building_id.as_deref(), self.room_id.as_deref())
    }

    pub fn push_title(&self) -> String {
        manual_push_title(self.building_id.as_deref())
    }

    pub fn notification_type(&self) -> &str {
        self.notification_type
            .as_deref()
            .filter(|t| !t.is_empty())
            .unwrap_or(crate::domain::preference::TEMPERATURE)
    }
}

pub fn manual_temperature_message(room_id: Option<&str>, temperature: Option<f64>) -> String {
    let room = match room_id.filter(|r| !r.is_empty()) {
        Some(room) => format!(" in room {room}"),
        None => String::new(),
    };
    let reading = match temperature {
        Some(t) => t.to_string(),
        None => "N/A".to_string(),
    };
    format!("Temperature alert{room}: {reading} C")
}

pub fn manual_push_title(building_id: Option<&str>) -> String {
    match building_id.filter(|b| !b.is_empty()) {
        Some(building) => format!("Temperature Alert - {building}"),
        None => "Temperature Alert".to_string(),
    }
}

pub fn temperature_cooldown_key(building_id: Option<&str>, room_id: Option<&str>) -> String {
    format!(
        "temp_alert:{}:{}",
        or_default(building_id, "unknown"),
        or_default(room_id, "unknown")
    )
}

fn js_str(value: &Option<String>) -> &str {
    value.as_deref().unwrap_or("undefined")
}

fn js_num(value: Option<f64>) -> String {
    match value {
        Some(n) => n.to_string(),
        None => "undefined".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn alert(direction: Option<&str>) -> TemperatureAlert {
        TemperatureAlert {
            building_id: Some("b1".into()),
            room_id: Some("r1".into()),
            temperature: Some(40.0),
            direction: direction.map(str::to_string),
            timestamp: Some(1_700_000_000_000),
        }
    }

    #[test]
    fn a_high_breach_reads_above_maximum() {
        assert_eq!(
            alert(Some("high")).message(),
            "b1 : r1 is 40°C (above maximum)"
        );
    }

    #[test]
    fn a_low_breach_reads_below_minimum() {
        assert_eq!(
            alert(Some("low")).message(),
            "b1 : r1 is 40°C (below minimum)"
        );
    }

    #[test]
    fn an_unrecognised_direction_adds_no_breach_suffix() {
        assert_eq!(alert(Some("sideways")).message(), "b1 : r1 is 40°C");
    }

    #[test]
    fn an_absent_direction_adds_no_breach_suffix() {
        assert_eq!(alert(None).message(), "b1 : r1 is 40°C");
    }

    #[test]
    fn a_fractional_temperature_keeps_its_decimals() {
        let mut a = alert(Some("high"));
        a.temperature = Some(21.5);
        assert_eq!(a.message(), "b1 : r1 is 21.5°C (above maximum)");
    }

    #[test]
    fn missing_fields_render_as_undefined_like_the_node_service() {
        let empty = TemperatureAlert {
            building_id: None,
            room_id: None,
            temperature: None,
            direction: None,
            timestamp: None,
        };
        assert_eq!(empty.message(), "undefined : undefined is undefined°C");
    }

    #[test]
    fn the_cooldown_key_is_scoped_by_building_and_room() {
        assert_eq!(alert(None).cooldown_key(), "temp_alert:b1:r1");
    }

    #[test]
    fn an_absent_building_or_room_falls_back_to_the_literal_unknown() {
        assert_eq!(
            temperature_cooldown_key(None, None),
            "temp_alert:unknown:unknown"
        );
        assert_eq!(
            temperature_cooldown_key(Some("b1"), None),
            "temp_alert:b1:unknown"
        );
        assert_eq!(
            temperature_cooldown_key(None, Some("r1")),
            "temp_alert:unknown:r1"
        );
    }

    #[test]
    fn an_empty_building_or_room_also_falls_back_to_unknown() {
        assert_eq!(
            temperature_cooldown_key(Some(""), Some("")),
            "temp_alert:unknown:unknown"
        );
    }

    #[test]
    fn the_push_title_carries_the_building_when_there_is_one() {
        assert_eq!(alert(None).push_title(), "Temperature Alert - b1");
    }

    #[test]
    fn the_push_title_drops_the_suffix_without_a_building() {
        let mut a = alert(None);
        a.building_id = None;
        assert_eq!(a.push_title(), "Temperature Alert");
    }

    #[test]
    fn the_manual_alert_message_names_the_room_when_there_is_one() {
        assert_eq!(
            manual_temperature_message(Some("r1"), Some(21.0)),
            "Temperature alert in room r1: 21 C"
        );
    }

    #[test]
    fn the_manual_alert_message_drops_the_room_clause_without_a_room() {
        assert_eq!(
            manual_temperature_message(None, Some(21.5)),
            "Temperature alert: 21.5 C"
        );
    }

    #[test]
    fn the_manual_alert_message_reads_n_a_without_a_temperature() {
        assert_eq!(
            manual_temperature_message(Some("r1"), None),
            "Temperature alert in room r1: N/A C"
        );
    }

    #[test]
    fn an_unscoped_notification_omits_domain_name_entirely() {
        let payload = serde_json::to_value(Notification::new(1, 1, "hi", "info", None)).unwrap();
        assert!(!payload.as_object().unwrap().contains_key("domainName"));
    }

    #[test]
    fn an_empty_domain_name_is_treated_as_unscoped() {
        let payload =
            serde_json::to_value(Notification::new(1, 1, "hi", "info", Some(String::new())))
                .unwrap();
        assert!(!payload.as_object().unwrap().contains_key("domainName"));
    }

    #[test]
    fn a_scoped_notification_carries_the_domain_name() {
        let payload =
            serde_json::to_value(Notification::new(1, 1, "hi", "danger", Some("d1".into())))
                .unwrap();
        assert_eq!(payload["domainName"], "d1");
    }

    #[test]
    fn the_id_is_the_millisecond_clock_rendered_as_a_string() {
        let payload =
            serde_json::to_value(Notification::new(1_700_000_000_000, 0, "hi", "info", None))
                .unwrap();
        assert_eq!(payload["id"], Value::String("1700000000000".into()));
    }

    #[test]
    fn the_timestamp_is_a_javascript_style_iso_string() {
        assert_eq!(iso8601(1_700_000_000_000), "2023-11-14T22:13:20.000Z");
        assert_eq!(iso8601(1_700_000_000_123), "2023-11-14T22:13:20.123Z");
    }

    #[test]
    fn the_notification_serialises_type_not_kind() {
        let payload = serde_json::to_value(Notification::new(1, 1, "hi", "danger", None)).unwrap();
        assert_eq!(payload["type"], "danger");
    }

    #[test]
    fn push_payload_defaults_fill_in_absent_fields() {
        assert_eq!(
            serde_json::to_value(PushPayload::new(None, None, None)).unwrap(),
            json!({
                "title": "CrowdVision Alert",
                "message": "New system update.",
                "icon": "/favicon.ico"
            })
        );
    }

    #[test]
    fn push_payload_empty_strings_fall_through_to_the_defaults() {
        let payload = PushPayload::new(Some(""), Some(""), Some(""));
        assert_eq!(payload, PushPayload::new(None, None, None));
    }

    #[test]
    fn push_payload_keeps_supplied_values() {
        let payload = PushPayload::new(Some("t"), Some("m"), Some("i"));
        assert_eq!(payload.title, "t");
        assert_eq!(payload.message, "m");
        assert_eq!(payload.icon, "i");
    }
}
