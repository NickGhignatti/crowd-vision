use crate::plugins::common::reading;
use crate::types::plugin::{
    ActionSpec, BoundDirection, BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin,
    check_fields,
};
use crate::types::reading::Reading;
use serde_json::Value;

static DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    value_field: "temperature",
    key: "temperature",
    label: "Temperature",
    interface_name: "ITemperature",
    unit: Some("C"),
    fields: &[
        FieldSpec {
            name: "buildingId",
            kind: FieldKind::NonEmptyString,
            required: true,
        },
        FieldSpec {
            name: "roomId",
            kind: FieldKind::NonEmptyString,
            required: true,
        },
        FieldSpec {
            name: "timestamp",
            kind: FieldKind::Finite,
            required: true,
        },
        FieldSpec {
            name: "temperature",
            kind: FieldKind::Finite,
            required: true,
        },
    ],
};

static BOUNDS: &[BoundSpec] = &[
    BoundSpec {
        key: "maxTemp",
        direction: BoundDirection::Above,
    },
    BoundSpec {
        key: "minTemp",
        direction: BoundDirection::Below,
    },
];

static ACTIONS: &[ActionSpec] = &[
    ActionSpec {
        name: "setTarget",
        label: "Set target temperature",
        parameters: &[FieldSpec {
            name: "target",
            kind: FieldKind::Finite,
            required: true,
        }],
    },
    ActionSpec {
        name: "increase",
        label: "Increase temperature",
        parameters: &[FieldSpec {
            name: "step",
            kind: FieldKind::Finite,
            required: false,
        }],
    },
    ActionSpec {
        name: "decrease",
        label: "Decrease temperature",
        parameters: &[FieldSpec {
            name: "step",
            kind: FieldKind::Finite,
            required: false,
        }],
    },
];

pub struct TemperaturePlugin;

impl SensorPlugin for TemperaturePlugin {
    fn key(&self) -> &'static str {
        DESCRIPTOR.key
    }

    fn descriptor(&self) -> &MetricDescriptor {
        &DESCRIPTOR
    }

    fn validate(&self, payload: &Value) -> Result<Reading, Vec<String>> {
        let errors = check_fields(DESCRIPTOR.fields, payload);
        if !errors.is_empty() {
            return Err(errors);
        }
        let value = payload[DESCRIPTOR.value_field].as_f64().unwrap_or_default();
        Ok(reading(payload, DESCRIPTOR.key, value))
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        BOUNDS
    }

    fn actions(&self) -> &'static [ActionSpec] {
        ACTIONS
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn temperature_declares_an_absolute_and_two_relative_actions() {
        let names: Vec<&str> = ACTIONS.iter().map(|spec| spec.name).collect();
        assert_eq!(names, vec!["setTarget", "increase", "decrease"]);
    }

    #[test]
    fn set_target_requires_its_target_but_a_step_is_optional() {
        assert!(ACTIONS[0].parameters[0].required);
        assert!(!ACTIONS[1].parameters[0].required);
    }

    fn payload() -> Value {
        json!({
            "buildingId": "b1",
            "roomId": "r1",
            "timestamp": 1_700_000_000_000i64,
            "temperature": 21.5
        })
    }

    #[test]
    fn a_valid_payload_becomes_a_reading_carrying_the_temperature_as_its_value() {
        let reading = TemperaturePlugin.validate(&payload()).unwrap();
        assert_eq!(reading.building_id, "b1");
        assert_eq!(reading.room_id, "r1");
        assert_eq!(reading.metric, "temperature");
        assert_eq!(reading.ts_ms, 1_700_000_000_000);
        assert_eq!(reading.value, 21.5);
    }

    #[test]
    fn the_whole_payload_is_carried_through_untouched() {
        let reading = TemperaturePlugin.validate(&payload()).unwrap();
        assert_eq!(reading.payload["temperature"], json!(21.5));
    }

    #[test]
    fn a_payload_missing_the_temperature_is_rejected() {
        let mut payload = payload();
        payload.as_object_mut().unwrap().remove("temperature");
        assert_eq!(
            TemperaturePlugin.validate(&payload).unwrap_err(),
            vec!["temperature: must be a finite number."]
        );
    }

    #[test]
    fn a_negative_temperature_is_accepted() {
        let mut payload = payload();
        payload["temperature"] = json!(-4.0);
        assert_eq!(TemperaturePlugin.validate(&payload).unwrap().value, -4.0);
    }

    #[test]
    fn breaches_are_bounded_above_by_max_temp_and_below_by_min_temp() {
        assert_eq!(
            TemperaturePlugin.bounds(),
            &[
                BoundSpec {
                    key: "maxTemp",
                    direction: BoundDirection::Above
                },
                BoundSpec {
                    key: "minTemp",
                    direction: BoundDirection::Below
                },
            ]
        );
    }
}
