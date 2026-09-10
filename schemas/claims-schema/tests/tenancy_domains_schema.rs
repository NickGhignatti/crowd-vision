use serde_json::Value;

const FIXTURE: &str = include_str!("../../fixtures/tenancy-domains.json");
const SCHEMA: &str = include_str!("../../json/tenancy-domains.schema.json");

// tenancy (Go) and the frontend exchange these; no Rust type owns them, so the identity crate hosts the check.
#[test]
fn every_message_the_fixture_records_matches_the_schema() {
    let validator = validator();
    for (name, body) in messages() {
        let errors: Vec<String> = validator
            .iter_errors(&body)
            .map(|e| e.to_string())
            .collect();
        assert!(errors.is_empty(), "{name}: {}", errors.join("; "));
    }
}

#[test]
fn every_create_body_the_fixture_rejects_fails_the_schema() {
    let validator = validator();
    for case in fixture()["rejectedCreate"].as_array().unwrap() {
        assert!(
            !validator.is_valid(&case["body"]),
            "{} validated",
            case["name"]
        );
    }
}

#[test]
fn a_zero_member_count_is_omitted_never_sent() {
    let mut domain = fixture()["domains"][0]["body"].clone();
    domain["memberCount"] = 0.into();
    assert!(!validator().is_valid(&domain));
}

fn messages() -> Vec<(String, Value)> {
    let fixture = fixture();
    let mut out: Vec<(String, Value)> = fixture["domains"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| (c["name"].to_string(), c["body"].clone()))
        .collect();
    for membership in fixture["memberships"].as_array().unwrap() {
        out.push(("membership".into(), membership.clone()));
    }
    for key in ["createDomain", "join", "inviteCode"] {
        out.push((key.into(), fixture[key].clone()));
    }
    out
}

fn fixture() -> Value {
    serde_json::from_str(FIXTURE).expect("fixture parses")
}

fn validator() -> jsonschema::Validator {
    let schema: Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
