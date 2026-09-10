const FIXTURE: &str = include_str!("../../fixtures/notification.json");
const SCHEMA: &str = include_str!("../../json/notification.schema.json");

#[test]
fn every_case_matches_the_schema() {
    let validator = validator();
    for case in cases("cases") {
        let errors: Vec<String> = validator
            .iter_errors(&case["body"])
            .map(|e| e.to_string())
            .collect();
        assert!(errors.is_empty(), "{}: {}", case["name"], errors.join("; "));
    }
}

#[test]
fn every_rejected_case_fails_the_schema() {
    let validator = validator();
    for case in cases("rejected") {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated",
            case["name"]
        );
    }
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture[group]
        .as_array()
        .expect("fixture group is an array")
        .clone()
}

fn validator() -> jsonschema::Validator {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
