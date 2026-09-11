use serde::de::{Error as DeError, MapAccess, Visitor};
use serde::ser::SerializeMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

pub const ALERTS_TOPIC: &str = "alerts";
pub const ALERTS_DLQ_TOPIC: &str = "alerts.dlq";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BoundDirection {
    #[serde(rename = "high")]
    Above,
    #[serde(rename = "low")]
    Below,
}

impl BoundDirection {
    pub fn wire_name(self) -> &'static str {
        match self {
            BoundDirection::Above => "high",
            BoundDirection::Below => "low",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct AlertEvent {
    pub building_id: String,
    pub room_id: String,
    pub metric: String,
    /// The payload field whose bound broke; one metric can bound several (air quality: co2, AQI).
    pub field: String,
    pub value: f64,
    pub label: String,
    pub unit: Option<String>,
    pub direction: BoundDirection,
    pub threshold: f64,
    pub ts_ms: i64,
}

const BUILDING_ID: &str = "buildingId";
const ROOM_ID: &str = "roomId";
const METRIC: &str = "type";
const FIELD: &str = "field";
const LABEL: &str = "label";
const UNIT: &str = "unit";
const DIRECTION: &str = "direction";
const THRESHOLD: &str = "threshold";
const TIMESTAMP: &str = "timestamp";

impl Serialize for AlertEvent {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(9 + usize::from(self.unit.is_some())))?;
        map.serialize_entry(BUILDING_ID, &self.building_id)?;
        map.serialize_entry(ROOM_ID, &self.room_id)?;
        map.serialize_entry(&self.field, &self.value)?;
        map.serialize_entry(METRIC, &self.metric)?;
        map.serialize_entry(FIELD, &self.field)?;
        map.serialize_entry(LABEL, &self.label)?;
        if let Some(unit) = &self.unit {
            map.serialize_entry(UNIT, unit)?;
        }
        map.serialize_entry(DIRECTION, &self.direction)?;
        map.serialize_entry(THRESHOLD, &self.threshold)?;
        map.serialize_entry(TIMESTAMP, &self.ts_ms)?;
        map.end()
    }
}

impl<'de> Deserialize<'de> for AlertEvent {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_map(AlertEventVisitor)
    }
}

struct AlertEventVisitor;

impl<'de> Visitor<'de> for AlertEventVisitor {
    type Value = AlertEvent;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("an alert object whose value is keyed by the field that breached")
    }

    fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<AlertEvent, M::Error> {
        let mut building_id = None;
        let mut room_id = None;
        let mut metric = None;
        let mut field = None;
        let mut label = None;
        let mut unit = None;
        let mut direction = None;
        let mut threshold = None;
        let mut ts_ms = None;
        let mut candidates: Vec<(String, serde_json::Value)> = Vec::new();

        while let Some(key) = map.next_key::<String>()? {
            match key.as_str() {
                BUILDING_ID => building_id = Some(map.next_value()?),
                ROOM_ID => room_id = Some(map.next_value()?),
                METRIC => metric = Some(map.next_value::<String>()?),
                FIELD => field = Some(map.next_value::<String>()?),
                LABEL => label = Some(map.next_value::<String>()?),
                UNIT => unit = map.next_value::<Option<String>>()?,
                DIRECTION => direction = Some(map.next_value()?),
                THRESHOLD => threshold = Some(map.next_value()?),
                TIMESTAMP => ts_ms = Some(map.next_value()?),
                _ => candidates.push((key, map.next_value()?)),
            }
        }

        let metric: String = metric.ok_or_else(|| DeError::missing_field(METRIC))?;
        // Records written before bounds named their field carry no field, label or unit.
        let field = field.unwrap_or_else(|| metric.clone());
        let label = label.unwrap_or_else(|| metric.clone());
        let value = candidates
            .into_iter()
            .find(|(key, _)| *key == field)
            .and_then(|(_, value)| value.as_f64())
            .ok_or_else(|| {
                DeError::custom(format!("alert carries no numeric \"{field}\" value"))
            })?;

        Ok(AlertEvent {
            building_id: building_id.ok_or_else(|| DeError::missing_field(BUILDING_ID))?,
            room_id: room_id.ok_or_else(|| DeError::missing_field(ROOM_ID))?,
            metric,
            field,
            value,
            label,
            unit,
            direction: direction.ok_or_else(|| DeError::missing_field(DIRECTION))?,
            threshold: threshold.ok_or_else(|| DeError::missing_field(THRESHOLD))?,
            ts_ms: ts_ms.ok_or_else(|| DeError::missing_field(TIMESTAMP))?,
        })
    }
}

/// The metrics notification delivers; telemetry pins it to exactly the plugins that declare bounds.
pub const ALERTABLE_METRICS: &[&str] = &["temperature", "airQuality", "peopleCount"];

impl AlertEvent {
    pub fn partition_key(&self) -> String {
        format!("{}:{}", self.building_id, self.room_id)
    }

    pub fn is_alertable(&self) -> bool {
        ALERTABLE_METRICS.contains(&self.metric.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn breach() -> AlertEvent {
        AlertEvent {
            building_id: "b1".to_string(),
            room_id: "r1".to_string(),
            metric: "temperature".to_string(),
            field: "temperature".to_string(),
            value: 40.0,
            label: "Temperature".to_string(),
            unit: Some("°C".to_string()),
            direction: BoundDirection::Above,
            threshold: 25.0,
            ts_ms: 1_700_000_000_000,
        }
    }

    fn co2_breach() -> AlertEvent {
        AlertEvent {
            metric: "airQuality".to_string(),
            field: "co2".to_string(),
            value: 1200.0,
            label: "CO2".to_string(),
            unit: Some("ppm".to_string()),
            threshold: 1000.0,
            ..breach()
        }
    }

    #[test]
    fn the_wire_shape_keys_the_value_by_the_field_that_breached() {
        assert_eq!(
            serde_json::to_value(breach()).unwrap(),
            json!({
                "buildingId": "b1",
                "roomId": "r1",
                "temperature": 40.0,
                "type": "temperature",
                "field": "temperature",
                "label": "Temperature",
                "unit": "°C",
                "direction": "high",
                "threshold": 25.0,
                "timestamp": 1_700_000_000_000i64,
            }),
        );
    }

    #[test]
    fn a_breach_on_one_field_of_a_metric_is_keyed_by_that_field_not_the_metric() {
        let body = serde_json::to_value(co2_breach()).unwrap();
        assert_eq!(body["co2"], 1200.0);
        assert_eq!(body["type"], "airQuality");
        assert!(body.get("airQuality").is_none());
    }

    #[test]
    fn a_field_without_a_unit_omits_it() {
        let aqi = AlertEvent {
            field: "indoor_aqi".to_string(),
            unit: None,
            ..co2_breach()
        };
        assert!(serde_json::to_value(aqi).unwrap().get("unit").is_none());
    }

    #[test]
    fn a_below_bound_breach_is_low_on_the_wire() {
        let mut alert = breach();
        alert.direction = BoundDirection::Below;
        assert_eq!(serde_json::to_value(alert).unwrap()["direction"], "low");
    }

    #[test]
    fn what_the_producer_writes_is_what_the_consumer_reads() {
        let people = AlertEvent {
            metric: "peopleCount".to_string(),
            field: "peopleCount".to_string(),
            label: "People Count".to_string(),
            unit: Some("people".to_string()),
            ..breach()
        };
        let aqi = AlertEvent {
            field: "indoor_aqi".to_string(),
            label: "Air Quality".to_string(),
            unit: None,
            ..co2_breach()
        };
        for alert in [breach(), people, co2_breach(), aqi] {
            let encoded = serde_json::to_string(&alert).unwrap();
            assert_eq!(serde_json::from_str::<AlertEvent>(&encoded).unwrap(), alert);
        }
    }

    #[test]
    fn a_record_written_before_bounds_named_their_field_still_parses() {
        let raw = json!({
            "buildingId": "b1", "roomId": "r1", "temperature": 40.0,
            "type": "temperature", "direction": "high", "threshold": 25.0, "timestamp": 1,
        });
        let alert = serde_json::from_value::<AlertEvent>(raw).unwrap();
        assert_eq!(alert.field, "temperature");
        assert_eq!(alert.label, "temperature");
        assert_eq!(alert.unit, None);
        assert_eq!(alert.value, 40.0);
    }

    #[test]
    fn an_alert_without_the_value_its_field_names_is_rejected() {
        let mut raw = serde_json::to_value(co2_breach()).unwrap();
        let object = raw.as_object_mut().unwrap();
        let value = object.remove("co2").unwrap();
        object.insert("airQuality".to_string(), value);
        let error = serde_json::from_value::<AlertEvent>(raw).unwrap_err();
        assert!(error.to_string().contains("co2"));
    }

    #[test]
    fn an_older_alert_without_the_value_its_type_names_is_rejected() {
        let raw = json!({
            "buildingId": "b1", "roomId": "r1", "temperature": 40.0,
            "type": "peopleCount", "direction": "high", "threshold": 25.0, "timestamp": 1,
        });
        let error = serde_json::from_value::<AlertEvent>(raw).unwrap_err();
        assert!(error.to_string().contains("peopleCount"));
    }

    #[test]
    fn every_field_older_records_carry_is_required() {
        for missing in [
            "buildingId",
            "roomId",
            "type",
            "direction",
            "threshold",
            "timestamp",
        ] {
            let mut raw = serde_json::to_value(breach()).unwrap();
            raw.as_object_mut().unwrap().remove(missing);
            assert!(
                serde_json::from_value::<AlertEvent>(raw).is_err(),
                "{missing} must be required"
            );
        }
    }

    #[test]
    fn a_directions_wire_name_is_the_name_it_serialises_as() {
        for direction in [BoundDirection::Above, BoundDirection::Below] {
            assert_eq!(
                serde_json::to_value(direction).unwrap(),
                json!(direction.wire_name()),
            );
        }
    }

    #[test]
    fn alerts_are_keyed_so_one_room_keeps_its_order_in_a_partition() {
        assert_eq!(breach().partition_key(), "b1:r1");
    }

    #[test]
    fn only_a_metric_notification_delivers_is_alertable() {
        assert!(breach().is_alertable());
        assert!(co2_breach().is_alertable());
        let humidity = AlertEvent {
            metric: "humidity".to_string(),
            ..breach()
        };
        assert!(!humidity.is_alertable());
    }
}
