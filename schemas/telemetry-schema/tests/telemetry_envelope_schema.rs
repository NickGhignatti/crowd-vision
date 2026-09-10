const FIXTURE: &str = include_str!("../../fixtures/telemetry-envelope.json");
const SCHEMA: &str = include_str!("../../json/telemetry-envelope.schema.json");

#[test]
fn every_tick_matches_the_schema() {
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
fn every_rejected_tick_fails_the_schema() {
    let validator = validator();
    for case in cases("rejected") {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated",
            case["name"]
        );
    }
}

#[test]
fn the_schema_refuses_a_reading_repeating_what_the_envelope_owns() {
    let validator = validator();
    for owned in ["buildingId", "ingestedAt"] {
        let mut tick = cases("cases")[0]["body"].clone();
        tick["readings"][0][owned] = tick[owned].clone();
        assert!(
            !validator.is_valid(&tick),
            "a reading carrying {owned} validated"
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
