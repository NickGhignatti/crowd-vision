use crate::contracts::plugin::{FieldKind, FieldSpec};
use serde_json::Value;

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

    const BUILDING_ID: FieldSpec = FieldSpec {
        name: "buildingId",
        kind: FieldKind::NonEmptyString,
        required: true,
    };

    const TEMPERATURE: FieldSpec = FieldSpec {
        name: "temperature",
        kind: FieldKind::Finite,
        required: true,
    };

    const PEOPLE_COUNT: FieldSpec = FieldSpec {
        name: "peopleCount",
        kind: FieldKind::NonNegativeInt,
        required: true,
    };

    const SCENARIO: FieldSpec = FieldSpec {
        name: "scenario",
        kind: FieldKind::NonEmptyString,
        required: false,
    };

    #[test]
    fn a_payload_satisfying_every_field_reports_no_errors() {
        let errors = check_fields(
            &[BUILDING_ID, TEMPERATURE],
            &json!({ "buildingId": "b1", "temperature": 21.5 }),
        );
        assert!(errors.is_empty());
    }

    #[test]
    fn a_missing_required_field_is_reported_by_name() {
        let errors = check_fields(&[BUILDING_ID], &json!({}));
        assert_eq!(errors, vec!["buildingId: must be a non-empty string."]);
    }

    #[test]
    fn an_optional_field_may_be_absent() {
        let errors = check_fields(&[SCENARIO], &json!({}));
        assert!(errors.is_empty());
    }

    #[test]
    fn an_optional_field_that_is_present_is_still_checked() {
        let errors = check_fields(&[SCENARIO], &json!({ "scenario": "" }));
        assert_eq!(errors, vec!["scenario: must be a non-empty string."]);
    }

    #[test]
    fn errors_accumulate_in_declaration_order_rather_than_short_circuiting() {
        let errors = check_fields(&[BUILDING_ID, TEMPERATURE, PEOPLE_COUNT], &json!({}));
        assert_eq!(
            errors,
            vec![
                "buildingId: must be a non-empty string.",
                "temperature: must be a finite number.",
                "peopleCount: must be a non-negative integer.",
            ]
        );
    }

    #[test]
    fn an_empty_string_is_rejected_for_a_non_empty_string_field() {
        let errors = check_fields(&[BUILDING_ID], &json!({ "buildingId": "" }));
        assert_eq!(errors, vec!["buildingId: must be a non-empty string."]);
    }

    #[test]
    fn a_number_is_rejected_for_a_non_empty_string_field() {
        let errors = check_fields(&[BUILDING_ID], &json!({ "buildingId": 42 }));
        assert_eq!(errors, vec!["buildingId: must be a non-empty string."]);
    }

    #[test]
    fn a_numeric_string_is_rejected_for_a_finite_field() {
        let errors = check_fields(&[TEMPERATURE], &json!({ "temperature": "21.5" }));
        assert_eq!(errors, vec!["temperature: must be a finite number."]);
    }

    #[test]
    fn a_negative_number_is_rejected_for_a_non_negative_int_field() {
        let errors = check_fields(&[PEOPLE_COUNT], &json!({ "peopleCount": -1 }));
        assert_eq!(errors, vec!["peopleCount: must be a non-negative integer."]);
    }

    #[test]
    fn a_fractional_number_is_rejected_for_a_non_negative_int_field() {
        let errors = check_fields(&[PEOPLE_COUNT], &json!({ "peopleCount": 3.5 }));
        assert_eq!(errors, vec!["peopleCount: must be a non-negative integer."]);
    }

    #[test]
    fn an_integral_float_is_accepted_for_a_non_negative_int_field() {
        let errors = check_fields(&[PEOPLE_COUNT], &json!({ "peopleCount": 4.0 }));
        assert!(errors.is_empty());
    }

    #[test]
    fn zero_is_accepted_for_a_non_negative_int_field() {
        let errors = check_fields(&[PEOPLE_COUNT], &json!({ "peopleCount": 0 }));
        assert!(errors.is_empty());
    }

    #[test]
    fn a_null_required_field_is_rejected() {
        let errors = check_fields(&[BUILDING_ID], &json!({ "buildingId": null }));
        assert_eq!(errors, vec!["buildingId: must be a non-empty string."]);
    }
}
