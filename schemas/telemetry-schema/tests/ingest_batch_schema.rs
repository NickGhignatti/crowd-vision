const FIXTURE: &str = include_str!("../../fixtures/ingest-batch.json");
const SCHEMA: &str = include_str!("../../json/ingest-batch.schema.json");

// The ingest batch has no Rust type on purpose -- telemetry walks it as raw JSON -- so this
// crate hosts the check even though it owns none of the shape. Validating a fixture against
// its schema needs no type, and pulling `jsonschema` into a service unifies cargo features
// on `reqwest` and leaves its runtime client without a rustls provider.
#[test]
fn every_batch_the_fixture_accepts_matches_the_schema() {
    let validator = validator();

    for case in cases("cases") {
        let errors: Vec<String> = validator
            .iter_errors(&case["body"])
            .map(|error| error.to_string())
            .collect();
        assert!(errors.is_empty(), "{}: {}", case["name"], errors.join("; "));
    }
}

// Each rejection the fixture records is a rule telemetry enforces in Rust. Any that the
// schema still accepts is a rule written in only one place.
#[test]
fn every_batch_the_fixture_rejects_fails_the_schema() {
    let validator = validator();

    for case in cases("rejected") {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated, but telemetry refuses it: {}",
            case["name"],
            case["reason"]
        );
    }
}

#[test]
fn the_schema_refuses_a_batch_over_the_five_hundred_reading_cap() {
    let reading = cases("cases")[0]["body"]["readings"][0].clone();
    let body = serde_json::json!({
        "buildingId": "bldg-3f2b4c5d",
        "readings": vec![reading; 501],
    });

    assert!(!validator().is_valid(&body));
}

fn fixture() -> serde_json::Value {
    serde_json::from_str(FIXTURE).expect("fixture parses")
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    fixture()[group]
        .as_array()
        .unwrap_or_else(|| panic!("the fixture has a {group} array"))
        .clone()
}

fn validator() -> jsonschema::Validator {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
