const FIXTURE: &str = include_str!("../../fixtures/building.json");
const SCHEMA: &str = include_str!("../../json/building.schema.json");

// Validating a fixture against its schema needs no Rust type, so it lives here rather
// than in digital-twin: pulling `jsonschema` into a service unifies cargo features on
// `reqwest` and leaves its runtime client without a rustls provider. digital-twin keeps
// the half that does need its type — parsing the fixture into `Building`.
#[test]
fn the_building_fixture_matches_the_schema_the_other_languages_validate() {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    let validator = jsonschema::validator_for(&schema).expect("schema compiles");

    let errors: Vec<String> = validator
        .iter_errors(&fixture)
        .map(|error| error.to_string())
        .collect();
    assert!(errors.is_empty(), "{}", errors.join("\n"));
}

#[test]
fn the_schema_refuses_a_room_without_a_capacity() {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    let mut fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture["rooms"][0]
        .as_object_mut()
        .expect("a room is an object")
        .remove("capacity");

    let validator = jsonschema::validator_for(&schema).expect("schema compiles");
    assert!(!validator.is_valid(&fixture));
}

#[test]
fn the_schema_refuses_an_unknown_top_level_field() {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    let mut fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture["maxTemperature"] = serde_json::json!(26.5);

    let validator = jsonschema::validator_for(&schema).expect("schema compiles");
    assert!(!validator.is_valid(&fixture));
}
