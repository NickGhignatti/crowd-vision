const FIXTURE: &str = include_str!("../../fixtures/notification-preferences.json");
const SCHEMA: &str = include_str!("../../json/notification-preferences.schema.json");

// notification parses these bodies with no shared type, so this crate hosts the check.
#[test]
fn the_reply_matches_the_schema() {
    let fixture = fixture();
    assert!(validator().is_valid(&fixture["response"]));
}

#[test]
fn every_request_the_fixture_accepts_matches_the_schema() {
    let validator = validator();
    for case in cases("requests") {
        let errors: Vec<String> = validator
            .iter_errors(&case["body"])
            .map(|e| e.to_string())
            .collect();
        assert!(errors.is_empty(), "{}: {}", case["name"], errors.join("; "));
    }
}

#[test]
fn every_request_the_fixture_rejects_fails_the_schema() {
    let validator = validator();
    for case in cases("rejected") {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated, but notification refuses it: {}",
            case["name"],
            case["reason"]
        );
    }
}

fn fixture() -> serde_json::Value {
    serde_json::from_str(FIXTURE).expect("fixture parses")
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    fixture()[group]
        .as_array()
        .expect("fixture group is an array")
        .clone()
}

fn validator() -> jsonschema::Validator {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
