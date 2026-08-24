use claims_contracts::ClaimsPayload;

const FIXTURE: &str = include_str!("../../contracts-fixtures/standard-claims.json");

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
