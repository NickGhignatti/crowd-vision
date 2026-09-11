use telemetry_schema::{AlertEvent, BoundDirection};
use time::OffsetDateTime;
use time::format_description::BorrowedFormatItem;
use time::macros::format_description;

use crate::domain::preference::TEMPERATURE;

pub use notification_schema::{NOTIFICATIONS_CHANNEL, Notification, Severity};
pub use telemetry_schema::{ALERTS_DLQ_TOPIC, ALERTS_TOPIC};
pub const COOLDOWN_SECONDS: u64 = 300;

const JS_ISO: &[BorrowedFormatItem] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z");

pub fn iso8601(millis: i64) -> String {
    OffsetDateTime::from_unix_timestamp_nanos(millis as i128 * 1_000_000)
        .expect("millisecond timestamps are in range")
        .format(JS_ISO)
        .expect("format is total over valid datetimes")
}

/// The one message both deliveries send; an empty domain means a broadcast.
pub fn notification(
    id_millis: i64,
    at_millis: i64,
    severity: Severity,
    title: &str,
    message: &str,
    domain_name: Option<String>,
) -> Notification {
    Notification {
        id: id_millis.to_string(),
        r#type: severity,
        title: title.to_string(),
        message: message.to_string(),
        timestamp: iso8601(at_millis),
        domain_name: domain_name.filter(|d| !d.is_empty()),
        icon: None,
    }
}

fn or_default(value: Option<&str>, fallback: &str) -> String {
    value
        .filter(|v| !v.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

pub fn breach_message(alert: &AlertEvent) -> String {
    let breach = match alert.direction {
        BoundDirection::Above => " (above maximum)",
        BoundDirection::Below => " (below minimum)",
    };
    let unit = alert
        .unit
        .as_deref()
        .map(|unit| format!(" {unit}"))
        .unwrap_or_default();
    format!(
        "{} : {} {} is {}{unit}{breach}",
        alert.building_id, alert.room_id, alert.label, alert.value
    )
}

pub fn breach_cooldown_key(alert: &AlertEvent) -> String {
    cooldown_key(
        &alert.metric,
        &alert.field,
        Some(&alert.building_id),
        Some(&alert.room_id),
    )
}

pub fn breach_push_title(alert: &AlertEvent) -> String {
    push_title(&alert.label, Some(&alert.building_id))
}

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
        cooldown_key(
            TEMPERATURE,
            TEMPERATURE,
            self.building_id.as_deref(),
            self.room_id.as_deref(),
        )
    }

    pub fn push_title(&self) -> String {
        manual_push_title(self.building_id.as_deref())
    }

    pub fn notification_type(&self) -> &str {
        self.notification_type
            .as_deref()
            .filter(|t| !t.is_empty())
            .unwrap_or(TEMPERATURE)
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
    push_title("Temperature", building_id)
}

fn push_title(label: &str, building_id: Option<&str>) -> String {
    match building_id.filter(|b| !b.is_empty()) {
        Some(building) => format!("{label} Alert - {building}"),
        None => format!("{label} Alert"),
    }
}

/// The Redis key throttling one field's alerts in one room, so metrics never silence each other.
pub fn cooldown_key(
    metric: &str,
    field: &str,
    building_id: Option<&str>,
    room_id: Option<&str>,
) -> String {
    format!(
        "alert:{metric}:{field}:{}:{}",
        or_default(building_id, "unknown"),
        or_default(room_id, "unknown")
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn alert(direction: BoundDirection) -> AlertEvent {
        AlertEvent {
            building_id: "b1".to_string(),
            room_id: "r1".to_string(),
            metric: "temperature".to_string(),
            field: "temperature".to_string(),
            value: 40.0,
            label: "Temperature".to_string(),
            unit: Some("°C".to_string()),
            direction,
            threshold: 25.0,
            ts_ms: 1_700_000_000_000,
        }
    }

    fn co2() -> AlertEvent {
        AlertEvent {
            metric: "airQuality".to_string(),
            field: "co2".to_string(),
            value: 1200.0,
            label: "CO2".to_string(),
            unit: Some("ppm".to_string()),
            threshold: 1000.0,
            ..alert(BoundDirection::Above)
        }
    }

    #[test]
    fn a_high_breach_reads_above_maximum() {
        assert_eq!(
            breach_message(&alert(BoundDirection::Above)),
            "b1 : r1 Temperature is 40 °C (above maximum)"
        );
    }

    #[test]
    fn a_low_breach_reads_below_minimum() {
        assert_eq!(
            breach_message(&alert(BoundDirection::Below)),
            "b1 : r1 Temperature is 40 °C (below minimum)"
        );
    }

    #[test]
    fn a_fractional_temperature_keeps_its_decimals() {
        let mut a = alert(BoundDirection::Above);
        a.value = 21.5;
        assert_eq!(
            breach_message(&a),
            "b1 : r1 Temperature is 21.5 °C (above maximum)"
        );
    }

    #[test]
    fn a_breach_on_another_field_names_its_own_label_and_unit() {
        assert_eq!(
            breach_message(&co2()),
            "b1 : r1 CO2 is 1200 ppm (above maximum)"
        );
        assert_eq!(breach_push_title(&co2()), "CO2 Alert - b1");
    }

    #[test]
    fn a_field_without_a_unit_shows_the_bare_value() {
        let aqi = AlertEvent {
            field: "indoor_aqi".to_string(),
            value: 162.0,
            label: "Air Quality".to_string(),
            unit: None,
            ..co2()
        };
        assert_eq!(
            breach_message(&aqi),
            "b1 : r1 Air Quality is 162 (above maximum)"
        );
    }

    #[test]
    fn a_temperature_breach_shares_its_cooldown_key_and_title_with_the_manual_push() {
        let a = alert(BoundDirection::Above);
        let manual = ManualTemperatureAlert {
            building_id: Some("b1".into()),
            room_id: Some("r1".into()),
            ..Default::default()
        };
        assert_eq!(
            breach_cooldown_key(&a),
            "alert:temperature:temperature:b1:r1"
        );
        assert_eq!(breach_cooldown_key(&a), manual.cooldown_key());
        assert_eq!(breach_push_title(&a), "Temperature Alert - b1");
        assert_eq!(breach_push_title(&a), manual.push_title());
    }

    #[test]
    fn each_field_throttles_on_its_own_key() {
        assert_eq!(breach_cooldown_key(&co2()), "alert:airQuality:co2:b1:r1");
        assert_ne!(
            breach_cooldown_key(&co2()),
            breach_cooldown_key(&alert(BoundDirection::Above))
        );
    }

    #[test]
    fn an_absent_building_or_room_falls_back_to_the_literal_unknown() {
        assert_eq!(
            cooldown_key("temperature", "temperature", None, None),
            "alert:temperature:temperature:unknown:unknown"
        );
        assert_eq!(
            cooldown_key("temperature", "temperature", Some("b1"), None),
            "alert:temperature:temperature:b1:unknown"
        );
        assert_eq!(
            cooldown_key("temperature", "temperature", None, Some("r1")),
            "alert:temperature:temperature:unknown:r1"
        );
    }

    #[test]
    fn an_empty_building_or_room_also_falls_back_to_unknown() {
        assert_eq!(
            cooldown_key("temperature", "temperature", Some(""), Some("")),
            "alert:temperature:temperature:unknown:unknown"
        );
    }

    #[test]
    fn the_push_title_drops_the_suffix_without_a_building() {
        assert_eq!(manual_push_title(None), "Temperature Alert");
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
        let payload =
            serde_json::to_value(notification(1, 1, Severity::Info, "t", "hi", None)).unwrap();
        assert!(!payload.as_object().unwrap().contains_key("domainName"));
    }

    #[test]
    fn an_empty_domain_name_is_treated_as_unscoped() {
        let payload = serde_json::to_value(notification(
            1,
            1,
            Severity::Info,
            "t",
            "hi",
            Some(String::new()),
        ))
        .unwrap();
        assert!(!payload.as_object().unwrap().contains_key("domainName"));
    }

    #[test]
    fn a_scoped_notification_carries_the_domain_name() {
        let payload = serde_json::to_value(notification(
            1,
            1,
            Severity::Danger,
            "t",
            "hi",
            Some("d1".into()),
        ))
        .unwrap();
        assert_eq!(payload["domainName"], "d1");
    }

    #[test]
    fn the_id_is_the_millisecond_clock_rendered_as_a_string() {
        let payload = serde_json::to_value(notification(
            1_700_000_000_000,
            0,
            Severity::Info,
            "t",
            "hi",
            None,
        ))
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
        let payload =
            serde_json::to_value(notification(1, 1, Severity::Danger, "t", "hi", None)).unwrap();
        assert_eq!(payload["type"], "danger");
    }

    #[test]
    fn a_built_notification_carries_no_icon() {
        let payload =
            serde_json::to_value(notification(1, 1, Severity::Info, "t", "hi", None)).unwrap();
        assert!(!payload.as_object().unwrap().contains_key("icon"));
    }
}
