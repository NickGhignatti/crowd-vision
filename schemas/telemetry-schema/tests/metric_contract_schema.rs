const FIXTURE: &str = include_str!("../../fixtures/metric-contract.json");
const SCHEMA: &str = include_str!("../../json/metric-contract.schema.json");

// Validating a fixture against its schema needs no Rust type, so it lives here rather than
// in telemetry or dashboard: pulling `jsonschema` into a service unifies cargo features on
// `reqwest` and leaves its runtime client without a rustls provider.
#[test]
fn the_metric_fixture_matches_the_schema_the_other_languages_validate() {
    let errors: Vec<String> = validator()
        .iter_errors(&fixture())
        .map(|error| error.to_string())
        .collect();
    assert!(errors.is_empty(), "{}", errors.join("\n"));
}

#[test]
fn the_schema_refuses_a_metric_without_a_kind() {
    let mut fixture = fixture();
    metric(&mut fixture).remove("kind");

    assert!(!validator().is_valid(&fixture));
}

// `unit` is null rather than absent when a metric is unitless, so dropping it is drift.
#[test]
fn the_schema_refuses_a_metric_without_a_unit() {
    let mut fixture = fixture();
    metric(&mut fixture).remove("unit");

    assert!(!validator().is_valid(&fixture));
}

// The old names are the drift that emptied the dashboard catalog; they must not validate.
#[test]
fn the_schema_refuses_the_pre_rename_field_names() {
    let mut fixture = fixture();
    let metric = metric(&mut fixture);
    let kind = metric.remove("kind").expect("the fixture has a kind");
    metric.insert("metricKey".to_owned(), kind);

    assert!(!validator().is_valid(&fixture));
}

#[test]
fn the_schema_refuses_a_field_kind_that_is_not_one_telemetry_emits() {
    let mut fixture = fixture();
    fixture["metrics"][0]["fields"][0]["type"] = serde_json::json!("String");

    assert!(!validator().is_valid(&fixture));
}

fn fixture() -> serde_json::Value {
    serde_json::from_str(FIXTURE).expect("fixture parses")
}

fn metric(fixture: &mut serde_json::Value) -> &mut serde_json::Map<String, serde_json::Value> {
    fixture["metrics"][0]
        .as_object_mut()
        .expect("a metric is an object")
}

fn validator() -> jsonschema::Validator {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
