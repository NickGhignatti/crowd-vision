// Runs the golden fixture shared with every other language binding
// (server/auth-policy/fixtures/conformance.json) through the real
// cedar-policy engine -- the identical-outcomes guarantee that justifies one
// shared policy bundle at all.

use serde::Deserialize;
use twin_service::infra::authz::authorize_any;
use twin_service::infra::claims::{ClaimsPayload, GatewayClaims, Membership};

#[derive(Deserialize)]
struct ConformanceMembership {
    domain: String,
    role: String,
}

#[derive(Deserialize)]
struct ConformanceContext {
    #[serde(rename = "requiredWeight")]
    required_weight: i64,
}

#[derive(Deserialize)]
struct ConformanceCase {
    name: String,
    memberships: Vec<ConformanceMembership>,
    action: String,
    domain: String,
    #[serde(default)]
    context: Option<ConformanceContext>,
    expected: String,
}

#[derive(Deserialize)]
struct Fixture {
    cases: Vec<ConformanceCase>,
}

const FIXTURE_JSON: &str = include_str!("../../auth-policy/fixtures/conformance.json");

#[test]
fn cedar_conformance_fixture_matches_every_golden_case() {
    let fixture: Fixture = serde_json::from_str(FIXTURE_JSON).expect("fixture parses");
    assert!(!fixture.cases.is_empty());

    let mut failures = Vec::new();
    for case in &fixture.cases {
        let claims = GatewayClaims {
            payload: ClaimsPayload {
                sub: "caller".to_string(),
                memberships: case
                    .memberships
                    .iter()
                    .map(|m| Membership {
                        domain: m.domain.clone(),
                        role: Some(m.role.clone()),
                    })
                    .collect(),
            },
            raw: String::new(),
        };

        let allowed = authorize_any(
            &claims,
            &case.action,
            &case.domain,
            case.context.as_ref().map(|c| c.required_weight),
        );
        let decision = if allowed { "allow" } else { "deny" };
        if decision != case.expected {
            failures.push(format!(
                "{}: expected {}, got {}",
                case.name, case.expected, decision
            ));
        }
    }

    assert!(
        failures.is_empty(),
        "conformance failures:\n{}",
        failures.join("\n")
    );
}
