const FIXTURE: &str = include_str!("../../fixtures/connected-devices.json");
const SCHEMA: &str = include_str!("../../json/connected-devices.schema.json");

// Telemetry builds this answer and the frontend reads it in TypeScript, so no compiler sees both.
// This crate hosts the check because it already carries `jsonschema`.
#[test]
fn every_answer_the_fixture_accepts_matches_the_schema() {
    let validator = validator();

    for case in cases("cases") {
        let errors: Vec<String> = validator
            .iter_errors(&case["body"])
            .map(|error| error.to_string())
            .collect();
        assert!(errors.is_empty(), "{}: {}", case["name"], errors.join("; "));
    }
}

// Each rejection is a rule the contract states for every reader; one the schema still accepts is a
// rule written in only one place.
#[test]
fn every_answer_the_fixture_rejects_fails_the_schema() {
    let validator = validator();

    for case in cases("rejected") {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated, but the contract refuses it: {}",
            case["name"],
            case["reason"]
        );
    }
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture[group]
        .as_array()
        .unwrap_or_else(|| panic!("the fixture has a {group} array"))
        .clone()
}

fn validator() -> jsonschema::Validator {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
