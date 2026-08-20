use crate::contracts::plugin::{
    BoundDirection, BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin, check_fields,
};
use crate::contracts::reading::Reading;
use crate::plugins::common::reading;
use serde_json::Value;

static DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    value_field: "peopleCount",
    key: "peopleCount",
    label: "People Count",
    interface_name: "IPeopleCount",
    unit: Some("people"),
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
            name: "peopleCount",
            kind: FieldKind::NonNegativeInt,
            required: true,
        },
    ],
};

static BOUNDS: &[BoundSpec] = &[BoundSpec {
    key: "maxPeople",
    direction: BoundDirection::Above,
}];

pub struct PeopleCountPlugin;

impl SensorPlugin for PeopleCountPlugin {
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
        let value = payload["peopleCount"].as_f64().unwrap_or_default();
        Ok(reading(payload, DESCRIPTOR.key, value))
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        BOUNDS
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
            "peopleCount": 12
        })
    }

    #[test]
    fn a_valid_payload_becomes_a_reading_carrying_the_count_as_its_value() {
        let reading = PeopleCountPlugin.validate(&payload()).unwrap();
        assert_eq!(reading.metric, "peopleCount");
        assert_eq!(reading.ts_ms, 1_700_000_000_000);
        assert_eq!(reading.value, 12.0);
    }

    #[test]
    fn an_empty_room_is_a_valid_reading() {
        let mut payload = payload();
        payload["peopleCount"] = json!(0);
        assert_eq!(PeopleCountPlugin.validate(&payload).unwrap().value, 0.0);
    }

    #[test]
    fn a_negative_count_is_rejected() {
        let mut payload = payload();
        payload["peopleCount"] = json!(-1);
        assert_eq!(
            PeopleCountPlugin.validate(&payload).unwrap_err(),
            vec!["peopleCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn a_fractional_count_is_rejected() {
        let mut payload = payload();
        payload["peopleCount"] = json!(3.5);
        assert_eq!(
            PeopleCountPlugin.validate(&payload).unwrap_err(),
            vec!["peopleCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn breaches_are_bounded_above_by_max_people_only() {
        assert_eq!(
            PeopleCountPlugin.bounds(),
            &[BoundSpec {
                key: "maxPeople",
                direction: BoundDirection::Above
            }]
        );
    }
}
