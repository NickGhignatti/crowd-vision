use crate::types::plugin::{BoundDirection, BoundSpec};
use serde_json::{Map, Value};

pub type Bounds = Map<String, Value>;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Breach {
    pub bound: BoundSpec,
    pub value: f64,
    pub threshold: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RoomTemperatureLimit {
    pub room_id: String,
    pub max_temperature: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TemperatureLimits {
    pub building_id: String,
    pub max_temperature: Option<f64>,
    pub rooms: Vec<RoomTemperatureLimit>,
}

pub fn resolve<'a>(room: Option<&'a Bounds>, building: Option<&'a Bounds>) -> Option<&'a Bounds> {
    room.or(building)
}

/// Every bound crossed by its own payload field; a field breaches once, the first listed bound wins.
pub fn breaches(spec: &[BoundSpec], bounds: &Bounds, payload: &Map<String, Value>) -> Vec<Breach> {
    let mut found: Vec<Breach> = Vec::new();
    for bound in spec {
        if found.iter().any(|seen| seen.bound.field == bound.field) {
            continue;
        }
        let threshold = bounds.get(bound.key).and_then(Value::as_f64);
        let value = payload.get(bound.field).and_then(Value::as_f64);
        let (Some(threshold), Some(value)) = (threshold, value) else {
            continue;
        };
        let breached = match bound.direction {
            BoundDirection::Above => value > threshold,
            BoundDirection::Below => value < threshold,
        };
        if breached {
            found.push(Breach {
                bound: *bound,
                value,
                threshold,
            });
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const TEMPERATURE: &[BoundSpec] = &[
        BoundSpec {
            key: "maxTemp",
            field: "temperature",
            label: "Temperature",
            unit: Some("°C"),
            direction: BoundDirection::Above,
        },
        BoundSpec {
            key: "minTemp",
            field: "temperature",
            label: "Temperature",
            unit: Some("°C"),
            direction: BoundDirection::Below,
        },
    ];

    const AIR_QUALITY: &[BoundSpec] = &[
        BoundSpec {
            key: "maxCo2",
            field: "co2",
            label: "CO2",
            unit: Some("ppm"),
            direction: BoundDirection::Above,
        },
        BoundSpec {
            key: "maxAqi",
            field: "indoor_aqi",
            label: "Air Quality",
            unit: None,
            direction: BoundDirection::Above,
        },
    ];

    fn object(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    fn temperature(value: f64) -> Map<String, Value> {
        object(json!({ "temperature": value }))
    }

    #[test]
    fn a_room_bound_overrides_the_building_bound() {
        let room = object(json!({ "maxTemp": 20.0 }));
        let building = object(json!({ "maxTemp": 30.0 }));
        let resolved = resolve(Some(&room), Some(&building)).unwrap();
        assert_eq!(resolved["maxTemp"], json!(20.0));
    }

    #[test]
    fn an_absent_room_bound_falls_back_to_the_building_bound() {
        let building = object(json!({ "maxTemp": 30.0 }));
        let resolved = resolve(None, Some(&building)).unwrap();
        assert_eq!(resolved["maxTemp"], json!(30.0));
    }

    #[test]
    fn no_bounds_at_all_means_no_breach() {
        assert!(resolve(None, None).is_none());
        assert!(breaches(TEMPERATURE, &object(json!({})), &temperature(100.0)).is_empty());
    }

    #[test]
    fn a_value_above_max_breaches_high_and_reports_the_max_as_the_threshold() {
        let bounds = object(json!({ "maxTemp": 25.0 }));
        let found = breaches(TEMPERATURE, &bounds, &temperature(26.0));
        assert_eq!(found[0].bound.direction, BoundDirection::Above);
        assert_eq!(found[0].threshold, 25.0);
        assert_eq!(found[0].value, 26.0);
    }

    #[test]
    fn a_value_below_min_breaches_low_and_reports_the_min_as_the_threshold() {
        let bounds = object(json!({ "minTemp": 18.0 }));
        let found = breaches(TEMPERATURE, &bounds, &temperature(17.0));
        assert_eq!(found[0].bound.direction, BoundDirection::Below);
        assert_eq!(found[0].threshold, 18.0);
    }

    #[test]
    fn a_value_exactly_on_the_bound_does_not_breach() {
        let bounds = object(json!({ "maxTemp": 25.0, "minTemp": 18.0 }));
        assert!(breaches(TEMPERATURE, &bounds, &temperature(25.0)).is_empty());
        assert!(breaches(TEMPERATURE, &bounds, &temperature(18.0)).is_empty());
    }

    #[test]
    fn one_field_breaches_once_and_high_is_checked_before_low() {
        let bounds = object(json!({ "maxTemp": 10.0, "minTemp": 30.0 }));
        let found = breaches(TEMPERATURE, &bounds, &temperature(20.0));
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].bound.direction, BoundDirection::Above);
        assert_eq!(found[0].threshold, 10.0);
    }

    #[test]
    fn a_bound_the_plugin_does_not_declare_is_ignored() {
        let bounds = object(json!({ "maxPeople": 5.0 }));
        assert!(breaches(TEMPERATURE, &bounds, &temperature(900.0)).is_empty());
    }

    #[test]
    fn a_non_numeric_bound_is_ignored_rather_than_breaching() {
        let bounds = object(json!({ "maxTemp": "25" }));
        assert!(breaches(TEMPERATURE, &bounds, &temperature(26.0)).is_empty());
    }

    #[test]
    fn each_bound_compares_its_own_field() {
        let bounds = object(json!({ "maxCo2": 1000.0, "maxAqi": 150.0 }));
        let payload = object(json!({ "co2": 1200.0, "indoor_aqi": 40.0 }));
        let found = breaches(AIR_QUALITY, &bounds, &payload);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].bound.field, "co2");
        assert_eq!(found[0].value, 1200.0);
        assert_eq!(found[0].threshold, 1000.0);
    }

    #[test]
    fn a_co2_limit_never_fires_on_the_aqi() {
        let bounds = object(json!({ "maxCo2": 1000.0 }));
        let payload = object(json!({ "co2": 600.0, "indoor_aqi": 1200.0 }));
        assert!(breaches(AIR_QUALITY, &bounds, &payload).is_empty());
    }

    #[test]
    fn two_fields_over_their_bounds_breach_once_each() {
        let bounds = object(json!({ "maxCo2": 1000.0, "maxAqi": 150.0 }));
        let payload = object(json!({ "co2": 1200.0, "indoor_aqi": 162.0 }));
        let fields: Vec<&str> = breaches(AIR_QUALITY, &bounds, &payload)
            .iter()
            .map(|breach| breach.bound.field)
            .collect();
        assert_eq!(fields, ["co2", "indoor_aqi"]);
    }

    #[test]
    fn a_field_the_payload_lacks_cannot_breach() {
        let bounds = object(json!({ "maxAqi": 150.0 }));
        let payload = object(json!({ "co2": 600.0 }));
        assert!(breaches(AIR_QUALITY, &bounds, &payload).is_empty());
    }
}
