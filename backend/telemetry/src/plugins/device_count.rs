use crate::plugins::common::reading;
use crate::types::plugin::{
    BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin, check_fields,
};
use crate::types::reading::Reading;
use serde_json::Value;

static TOTAL_DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    value_field: "totalDeviceCount",
    key: "totalDeviceCount",
    label: "Total Device Count",
    interface_name: "ITotalDeviceCount",
    unit: Some("devices"),
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
            name: "totalDeviceCount",
            kind: FieldKind::NonNegativeInt,
            required: true,
        },
    ],
};

/// Neither metric alerts. A device count is an access-point capacity question, not a facility
/// one -- it fires on a room full of laptops. The estimate beside it is a count divided by a
/// site-configured factor, so a threshold on it would alert on the factor as much as on the
/// building. Occupancy alerting stays with `peopleCount`, which is a measurement of people.
static NO_BOUNDS: &[BoundSpec] = &[];

static RATIO_DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    value_field: "ratioDeviceCount",
    key: "ratioDeviceCount",
    label: "Estimated People Count",
    interface_name: "IRatioDeviceCount",
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
            name: "ratioDeviceCount",
            kind: FieldKind::NonNegativeInt,
            required: true,
        },
    ],
};

pub struct TotalDeviceCountPlugin;

impl SensorPlugin for TotalDeviceCountPlugin {
    fn key(&self) -> &'static str {
        TOTAL_DESCRIPTOR.key
    }

    fn descriptor(&self) -> &MetricDescriptor {
        &TOTAL_DESCRIPTOR
    }

    fn validate(&self, payload: &Value) -> Result<Reading, Vec<String>> {
        validate_against(&TOTAL_DESCRIPTOR, payload)
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        NO_BOUNDS
    }
}

pub struct RatioDeviceCountPlugin;

impl SensorPlugin for RatioDeviceCountPlugin {
    fn key(&self) -> &'static str {
        RATIO_DESCRIPTOR.key
    }

    fn descriptor(&self) -> &MetricDescriptor {
        &RATIO_DESCRIPTOR
    }

    fn validate(&self, payload: &Value) -> Result<Reading, Vec<String>> {
        validate_against(&RATIO_DESCRIPTOR, payload)
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        NO_BOUNDS
    }
}

fn validate_against(
    descriptor: &'static MetricDescriptor,
    payload: &Value,
) -> Result<Reading, Vec<String>> {
    let errors = check_fields(descriptor.fields, payload);
    if !errors.is_empty() {
        return Err(errors);
    }
    let value = payload[descriptor.value_field].as_f64().unwrap_or_default();
    Ok(reading(payload, descriptor.key, value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn total_payload() -> Value {
        json!({
            "buildingId": "b1",
            "roomId": "lobby",
            "timestamp": 1_700_000_000_000i64,
            "totalDeviceCount": 9
        })
    }

    fn ratio_payload() -> Value {
        json!({
            "buildingId": "b1",
            "roomId": "lobby",
            "timestamp": 1_700_000_000_000i64,
            "ratioDeviceCount": 4
        })
    }

    #[test]
    fn a_valid_total_payload_becomes_a_reading_carrying_the_device_count() {
        let reading = TotalDeviceCountPlugin.validate(&total_payload()).unwrap();
        assert_eq!(reading.metric, "totalDeviceCount");
        assert_eq!(reading.building_id, "b1");
        assert_eq!(reading.room_id, "lobby");
        assert_eq!(reading.ts_ms, 1_700_000_000_000);
        assert_eq!(reading.value, 9.0);
    }

    #[test]
    fn a_valid_ratio_payload_becomes_a_reading_carrying_the_estimate() {
        let reading = RatioDeviceCountPlugin.validate(&ratio_payload()).unwrap();
        assert_eq!(reading.metric, "ratioDeviceCount");
        assert_eq!(reading.room_id, "lobby");
        assert_eq!(reading.value, 4.0);
    }

    #[test]
    fn the_two_metrics_are_distinct_keys() {
        assert_ne!(TotalDeviceCountPlugin.key(), RatioDeviceCountPlugin.key());
    }

    #[test]
    fn each_plugin_names_its_value_field_after_its_key() {
        // The collector builds every reading as {"type": key, key: value} and the registry
        // dispatches on `type`. Drift between the two rejects every batch it sends.
        for descriptor in [&TOTAL_DESCRIPTOR, &RATIO_DESCRIPTOR] {
            assert_eq!(descriptor.key, descriptor.value_field);
        }
    }

    #[test]
    fn an_empty_zone_is_a_valid_reading_for_both() {
        let mut total = total_payload();
        total["totalDeviceCount"] = json!(0);
        assert_eq!(
            TotalDeviceCountPlugin.validate(&total).unwrap().value,
            0.0,
            "zero is real data: the zone is empty"
        );

        let mut ratio = ratio_payload();
        ratio["ratioDeviceCount"] = json!(0);
        assert_eq!(RatioDeviceCountPlugin.validate(&ratio).unwrap().value, 0.0);
    }

    #[test]
    fn a_negative_count_is_rejected() {
        let mut payload = total_payload();
        payload["totalDeviceCount"] = json!(-1);
        assert_eq!(
            TotalDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["totalDeviceCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn a_fractional_count_is_rejected() {
        let mut payload = ratio_payload();
        payload["ratioDeviceCount"] = json!(3.5);
        assert_eq!(
            RatioDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["ratioDeviceCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn a_quoted_count_is_rejected() {
        let mut payload = total_payload();
        payload["totalDeviceCount"] = json!("9");
        assert_eq!(
            TotalDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["totalDeviceCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn a_null_count_is_rejected() {
        let mut payload = total_payload();
        payload["totalDeviceCount"] = json!(null);
        assert_eq!(
            TotalDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["totalDeviceCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn a_payload_missing_its_count_is_rejected() {
        let mut payload = ratio_payload();
        payload.as_object_mut().unwrap().remove("ratioDeviceCount");
        assert_eq!(
            RatioDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["ratioDeviceCount: must be a non-negative integer."]
        );
    }

    #[test]
    fn a_total_reading_without_a_room_is_rejected_rather_than_stored_unattributed() {
        // `common::reading` reads roomId unconditionally, so an undeclared roomId becomes ""
        // and lands in a not-null column -- a zone reading attributed to nowhere.
        let mut payload = total_payload();
        payload.as_object_mut().unwrap().remove("roomId");
        assert_eq!(
            TotalDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["roomId: must be a non-empty string."]
        );
    }

    #[test]
    fn a_ratio_reading_without_a_room_is_rejected_too() {
        let mut payload = ratio_payload();
        payload.as_object_mut().unwrap().remove("roomId");
        assert_eq!(
            RatioDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["roomId: must be a non-empty string."]
        );
    }

    #[test]
    fn an_empty_room_id_is_rejected() {
        let mut payload = total_payload();
        payload["roomId"] = json!("");
        assert_eq!(
            TotalDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["roomId: must be a non-empty string."]
        );
    }

    #[test]
    fn a_payload_missing_the_building_is_rejected() {
        let mut payload = total_payload();
        payload.as_object_mut().unwrap().remove("buildingId");
        assert_eq!(
            TotalDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["buildingId: must be a non-empty string."]
        );
    }

    #[test]
    fn a_non_numeric_timestamp_is_rejected() {
        let mut payload = ratio_payload();
        payload["timestamp"] = json!("recent");
        assert_eq!(
            RatioDeviceCountPlugin.validate(&payload).unwrap_err(),
            vec!["timestamp: must be a finite number."]
        );
    }

    #[test]
    fn the_whole_payload_is_carried_through_untouched() {
        let reading = TotalDeviceCountPlugin.validate(&total_payload()).unwrap();
        assert_eq!(reading.payload["totalDeviceCount"], json!(9));
        assert_eq!(reading.payload["roomId"], json!("lobby"));
        assert_eq!(reading.payload["buildingId"], json!("b1"));
    }

    #[test]
    fn neither_metric_carries_a_threshold() {
        // Both are device counts, one of them divided by a site-configured factor. Occupancy
        // alerting belongs to `peopleCount`, which measures people rather than inferring them.
        assert!(TotalDeviceCountPlugin.bounds().is_empty());
        assert!(RatioDeviceCountPlugin.bounds().is_empty());
    }

    #[test]
    fn neither_plugin_exposes_an_action() {
        assert!(TotalDeviceCountPlugin.actions().is_empty());
        assert!(RatioDeviceCountPlugin.actions().is_empty());
    }
}
