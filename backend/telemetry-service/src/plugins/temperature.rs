use crate::contracts::plugin::{
    BoundDirection, BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin,
};
use crate::contracts::reading::Reading;
use crate::plugins::common::{check_fields, reading};
use serde_json::Value;

static DESCRIPTOR: MetricDescriptor = MetricDescriptor {
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
        let value = payload["temperature"].as_f64().unwrap_or_default();
        Ok(reading(payload, DESCRIPTOR.key, value))
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        BOUNDS
    }

    fn alert_channel(&self) -> Option<&'static str> {
        Some("alerts:temperature")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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

    #[test]
    fn breaches_are_published_to_the_temperature_alert_channel() {
        assert_eq!(
            TemperaturePlugin.alert_channel(),
            Some("alerts:temperature")
        );
    }
}
