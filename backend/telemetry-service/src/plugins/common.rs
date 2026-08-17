use crate::contracts::plugin::{FieldKind, FieldSpec};
use crate::contracts::reading::Reading;
use serde_json::Value;

pub fn reading(payload: &Value, metric: &str, value: f64) -> Reading {
    Reading {
        building_id: payload["buildingId"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        room_id: payload["roomId"].as_str().unwrap_or_default().to_owned(),
        metric: metric.to_owned(),
        ts_ms: payload["timestamp"].as_f64().unwrap_or_default() as i64,
        value,
        payload: payload.as_object().cloned().unwrap_or_default(),
    }
}

pub fn check_fields(fields: &[FieldSpec], payload: &Value) -> Vec<String> {
    fields
        .iter()
        .filter_map(|spec| check_field(spec, payload.get(spec.name)))
        .collect()
}

fn check_field(spec: &FieldSpec, value: Option<&Value>) -> Option<String> {
    match value {
        None | Some(Value::Null) if !spec.required => None,
        Some(value) if accepts(spec.kind, value) => None,
        _ => Some(format!("{}: must be {}.", spec.name, phrase(spec.kind))),
    }
}

fn accepts(kind: FieldKind, value: &Value) -> bool {
    match kind {
        FieldKind::NonEmptyString => value.as_str().is_some_and(|s| !s.is_empty()),
        FieldKind::Finite => value.as_f64().is_some(),
        FieldKind::NonNegativeInt => value.as_f64().is_some_and(|n| n >= 0.0 && n.fract() == 0.0),
    }
}

fn phrase(kind: FieldKind) -> &'static str {
    match kind {
        FieldKind::NonEmptyString => "a non-empty string",
        FieldKind::Finite => "a finite number",
        FieldKind::NonNegativeInt => "a non-negative integer",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const AQI: &[FieldSpec] = &[FieldSpec {
        name: "aqi",
        kind: FieldKind::NonNegativeInt,
        required: true,
    }];

    const MESSAGE: &str = "aqi: must be a non-negative integer.";

    fn errors_for(value: Value) -> Vec<String> {
        check_fields(AQI, &json!({ "aqi": value }))
    }

    #[test]
    fn a_positive_integer_is_accepted() {
        assert!(errors_for(json!(31)).is_empty());
    }

    #[test]
    fn zero_is_accepted() {
        assert!(errors_for(json!(0)).is_empty());
    }

    #[test]
    fn an_integral_float_is_accepted() {
        assert!(errors_for(json!(31.0)).is_empty());
    }

    #[test]
    fn a_negative_number_is_rejected() {
        assert_eq!(errors_for(json!(-3)), vec![MESSAGE]);
    }

    #[test]
    fn a_fractional_number_is_rejected() {
        assert_eq!(errors_for(json!(3.5)), vec![MESSAGE]);
    }

    #[test]
    fn a_numeric_string_is_rejected() {
        assert_eq!(errors_for(json!("31")), vec![MESSAGE]);
    }

    #[test]
    fn a_null_value_is_rejected_when_required() {
        assert_eq!(errors_for(json!(null)), vec![MESSAGE]);
    }

    #[test]
    fn a_missing_value_is_rejected_when_required() {
        assert_eq!(check_fields(AQI, &json!({})), vec![MESSAGE]);
    }

    #[test]
    fn a_missing_value_is_accepted_when_optional() {
        const OPTIONAL_AQI: &[FieldSpec] = &[FieldSpec {
            name: "aqi",
            kind: FieldKind::NonNegativeInt,
            required: false,
        }];
        assert!(check_fields(OPTIONAL_AQI, &json!({})).is_empty());
    }
}
