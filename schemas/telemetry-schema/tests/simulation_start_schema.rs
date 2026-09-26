const FIXTURE: &str = include_str!("../../fixtures/simulation-start.json");
const SCHEMA: &str = include_str!("../../json/simulation-start.schema.json");

// Telemetry builds this body and three simulators parse it in two other languages, so no
// compiler sees all three. This crate hosts the check because it already carries `jsonschema`.
#[test]
fn every_start_the_fixture_accepts_matches_the_schema() {
    let validator = validator();

    for case in cases("cases") {
        let errors: Vec<String> = validator
            .iter_errors(&case["body"])
            .map(|error| error.to_string())
            .collect();
        assert!(errors.is_empty(), "{}: {}", case["name"], errors.join("; "));
    }
}

// Each rejection is a rule the simulators enforce in their own language; one the schema still
// accepts is a rule written in only one place.
#[test]
fn every_start_the_fixture_rejects_fails_the_schema() {
    let validator = validator();

    for case in cases("rejected") {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated, but the simulators refuse it: {}",
            case["name"],
            case["reason"]
        );
    }
}

#[test]
fn every_case_names_who_parses_it() {
    for case in cases("cases") {
        let consumer = case["consumer"].as_str().unwrap_or_default();
        assert!(
            ["sensor-simulator", "aq-simulator", "ap-simulator", "any"].contains(&consumer),
            "{}: unknown consumer {consumer:?}",
            case["name"]
        );
    }
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
