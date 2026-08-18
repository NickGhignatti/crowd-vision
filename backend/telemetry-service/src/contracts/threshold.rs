use crate::contracts::plugin::{BoundDirection, BoundSpec};
use serde_json::{Map, Value};

pub type Bounds = Map<String, Value>;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Breach {
    pub direction: BoundDirection,
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

pub fn breach(spec: &[BoundSpec], bounds: &Bounds, value: f64) -> Option<Breach> {
    spec.iter().find_map(|bound| {
        let threshold = bounds.get(bound.key)?.as_f64()?;
        let breached = match bound.direction {
            BoundDirection::Above => value > threshold,
            BoundDirection::Below => value < threshold,
        };
        breached.then_some(Breach {
            direction: bound.direction,
            threshold,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const TEMPERATURE: &[BoundSpec] = &[
        BoundSpec {
            key: "maxTemp",
            direction: BoundDirection::Above,
        },
        BoundSpec {
            key: "minTemp",
            direction: BoundDirection::Below,
        },
    ];

    fn bounds(value: Value) -> Bounds {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn a_room_bound_overrides_the_building_bound() {
        let room = bounds(json!({ "maxTemp": 20.0 }));
        let building = bounds(json!({ "maxTemp": 30.0 }));
        let resolved = resolve(Some(&room), Some(&building)).unwrap();
        assert_eq!(resolved["maxTemp"], json!(20.0));
    }

    #[test]
    fn an_absent_room_bound_falls_back_to_the_building_bound() {
        let building = bounds(json!({ "maxTemp": 30.0 }));
        let resolved = resolve(None, Some(&building)).unwrap();
        assert_eq!(resolved["maxTemp"], json!(30.0));
    }

    #[test]
    fn no_bounds_at_all_means_no_breach() {
        assert!(resolve(None, None).is_none());
        assert!(breach(TEMPERATURE, &bounds(json!({})), 100.0).is_none());
    }

    #[test]
    fn a_value_above_max_breaches_high_and_reports_the_max_as_the_threshold() {
        let breach = breach(TEMPERATURE, &bounds(json!({ "maxTemp": 25.0 })), 26.0).unwrap();
        assert_eq!(breach.direction, BoundDirection::Above);
        assert_eq!(breach.threshold, 25.0);
    }

    #[test]
    fn a_value_below_min_breaches_low_and_reports_the_min_as_the_threshold() {
        let breach = breach(TEMPERATURE, &bounds(json!({ "minTemp": 18.0 })), 17.0).unwrap();
        assert_eq!(breach.direction, BoundDirection::Below);
        assert_eq!(breach.threshold, 18.0);
    }

    #[test]
    fn a_value_exactly_on_the_bound_does_not_breach() {
        let bounds = bounds(json!({ "maxTemp": 25.0, "minTemp": 18.0 }));
        assert!(breach(TEMPERATURE, &bounds, 25.0).is_none());
        assert!(breach(TEMPERATURE, &bounds, 18.0).is_none());
    }

    #[test]
    fn high_is_checked_before_low_when_both_could_apply() {
        let bounds = bounds(json!({ "maxTemp": 10.0, "minTemp": 30.0 }));
        let breach = breach(TEMPERATURE, &bounds, 20.0).unwrap();
        assert_eq!(breach.direction, BoundDirection::Above);
        assert_eq!(breach.threshold, 10.0);
    }

    #[test]
    fn a_bound_the_plugin_does_not_declare_is_ignored() {
        let bounds = bounds(json!({ "maxPeople": 5.0 }));
        assert!(breach(TEMPERATURE, &bounds, 900.0).is_none());
    }

    #[test]
    fn a_non_numeric_bound_is_ignored_rather_than_breaching() {
        let bounds = bounds(json!({ "maxTemp": "25" }));
        assert!(breach(TEMPERATURE, &bounds, 26.0).is_none());
    }
}
