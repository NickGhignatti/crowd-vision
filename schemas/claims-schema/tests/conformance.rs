use claims_schema::ClaimsPayload;

const FIXTURE: &str = include_str!("../../fixtures/standard-claims.json");

#[test]
fn the_shared_fixture_conforms_to_the_claims_contract() {
    let claims: ClaimsPayload = serde_json::from_str(FIXTURE).expect("fixture parses");

    assert!(claims.user_id().is_some(), "fixture has no sub");
    assert!(claims.account().is_some(), "fixture has no accountName");
    assert!(claims.session_id().is_some(), "fixture has no sid");
    assert!(
        !claims.memberships.is_empty(),
        "fixture carries no membership"
    );

    for membership in &claims.memberships {
        assert!(!membership.domain.is_empty());
        assert!(membership.role.is_some());
        assert!(membership.external_id.is_some());
    }
}

#[test]
fn no_field_of_the_fixture_is_silently_dropped() {
    let parsed: ClaimsPayload = serde_json::from_str(FIXTURE).expect("fixture parses");
    let round_tripped: serde_json::Value =
        serde_json::from_str(&serde_json::to_string(&parsed).expect("claims serialise"))
            .expect("round trip parses");

    assert_eq!(
        round_tripped,
        serde_json::from_str::<serde_json::Value>(FIXTURE).expect("fixture parses as json"),
    );
}

const SCHEMA: &str = include_str!("../../json/standard-claims.schema.json");

// Rust gets the shape for free by parsing into ClaimsPayload. This asserts the
// fixture also matches the schema Python validates against, so the three
// languages cannot drift apart through a fixture nobody re-checked.
#[test]
fn the_fixture_matches_the_schema_the_other_languages_validate() {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    let validator = jsonschema::validator_for(&schema).expect("schema compiles");

    let errors: Vec<String> = validator
        .iter_errors(&fixture)
        .map(|e| e.to_string())
        .collect();
    assert!(errors.is_empty(), "{}", errors.join("\n"));
}

#[test]
fn the_schema_refuses_a_role_outside_the_shared_ladder() {
    let schema: serde_json::Value = serde_json::from_str(SCHEMA).expect("schema parses");
    let mut fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture["memberships"][0]["role"] = serde_json::json!("emperor");

    let validator = jsonschema::validator_for(&schema).expect("schema compiles");
    assert!(!validator.is_valid(&fixture));
}
