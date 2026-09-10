use serde_json::{Value, json};

const FIXTURE: &str = include_str!("../../fixtures/chat-conversation.json");
const SCHEMA: &str = include_str!("../../json/chat-conversation.schema.json");

// chat (Rust) serves these to the frontend; only chat has a Rust type, so a crate with a validator hosts the check.
#[test]
fn the_list_and_the_conversation_match_the_schema() {
    let validator = validator();
    let fixture = fixture();
    for key in ["list", "conversation"] {
        let errors: Vec<String> = validator
            .iter_errors(&fixture[key])
            .map(|e| e.to_string())
            .collect();
        assert!(errors.is_empty(), "{key}: {}", errors.join("; "));
    }
}

#[test]
fn every_conversation_the_fixture_rejects_fails_the_schema() {
    let validator = validator();
    for case in fixture()["rejected"].as_array().unwrap() {
        assert!(
            !validator.is_valid(&case["conversation"]),
            "{} validated",
            case["name"]
        );
    }
}

#[test]
fn null_citations_fail_the_schema() {
    let mut conversation = fixture()["conversation"].clone();
    conversation["messages"][0]["citations"] = Value::Null;
    assert!(!validator().is_valid(&conversation));
}

#[test]
fn an_extended_json_object_id_fails_the_schema() {
    let mut conversation = fixture()["conversation"].clone();
    conversation["_id"] = json!({ "$oid": "65f0000000000000000000aa" });
    assert!(!validator().is_valid(&conversation));
}

fn fixture() -> Value {
    serde_json::from_str(FIXTURE).expect("fixture parses")
}

fn validator() -> jsonschema::Validator {
    let schema: Value = serde_json::from_str(SCHEMA).expect("schema parses");
    jsonschema::validator_for(&schema).expect("schema compiles")
}
