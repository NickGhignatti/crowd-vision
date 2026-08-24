use base64::Engine;
use base64::engine::general_purpose::STANDARD;

pub use claims_contracts::{CLAIMS_HEADER, ClaimsPayload, Membership};

const SYSTEM_SUBJECT_PREFIX: &str = "system:";

const ADMIN_ROLE: &str = "admin";

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub payload: ClaimsPayload,
    pub raw: String,
}

impl GatewayClaims {
    pub fn account_name(&self) -> &str {
        self.payload
            .account()
            .expect("claims are only constructed with a non-empty accountName")
    }

    pub fn is_system(&self) -> bool {
        self.payload
            .user_id()
            .is_some_and(|sub| sub.starts_with(SYSTEM_SUBJECT_PREFIX))
    }

    pub fn is_global_admin(&self) -> bool {
        self.payload.has_role(ADMIN_ROLE)
    }

    pub fn belongs_to(&self, domain: &str) -> bool {
        self.payload.belongs_to(domain)
    }

    pub fn domains(&self) -> Vec<String> {
        let mut domains: Vec<String> = Vec::new();
        for domain in self.payload.domains() {
            if !domain.is_empty() && !domains.iter().any(|seen| seen == domain) {
                domains.push(domain.to_string());
            }
        }
        domains
    }
}

#[derive(Debug, Clone)]
pub enum Audience {
    Unrestricted,
    Domains(Vec<String>),
}

impl Audience {
    pub fn of(claims: &GatewayClaims) -> Self {
        if claims.is_system() || claims.is_global_admin() {
            return Audience::Unrestricted;
        }
        Audience::Domains(claims.domains())
    }

    pub fn permits(&self, domain: &str) -> bool {
        match self {
            Audience::Unrestricted => true,
            Audience::Domains(domains) => domains.iter().any(|d| d == domain),
        }
    }
}

pub fn system_claims_header() -> String {
    STANDARD.encode(r#"{"sub":"system:notification-service","memberships":[]}"#)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn claims(payload: &str) -> GatewayClaims {
        GatewayClaims {
            payload: serde_json::from_str(payload).unwrap(),
            raw: String::new(),
        }
    }

    #[test]
    fn membership_does_not_cascade_down_the_domain_hierarchy() {
        let claims = claims(
            r#"{"sub":"3f2b","accountName":"ada","memberships":[{"domain":"unibo","role":"business_admin"}]}"#,
        );

        assert!(!claims.belongs_to("eng.unibo"));
        assert!(!Audience::of(&claims).permits("eng.unibo"));
    }

    #[test]
    fn a_global_admin_may_reach_any_domain() {
        let claims = claims(
            r#"{"sub":"3f2b","accountName":"root","memberships":[{"domain":"eng","role":"admin"}]}"#,
        );
        let audience = Audience::of(&claims);

        assert!(claims.is_global_admin());
        assert!(audience.permits("eng"));
        assert!(audience.permits("finance"));
    }

    #[test]
    fn a_business_admin_is_not_a_global_admin() {
        let claims = claims(
            r#"{"sub":"3f2b","accountName":"ada","memberships":[{"domain":"eng","role":"business_admin"}]}"#,
        );
        let audience = Audience::of(&claims);

        assert!(!claims.is_global_admin());
        assert!(audience.permits("eng"));
        assert!(!audience.permits("finance"));
    }

    #[test]
    fn the_admin_role_is_the_top_of_the_shared_ladder() {
        let ladder: serde_json::Map<String, Value> =
            serde_json::from_str(include_str!("../../../auth-contracts/roles.json")).unwrap();
        let admin = ladder["admin"].as_i64().unwrap();

        assert!(
            ladder.values().all(|w| w.as_i64().unwrap() <= admin),
            "policy.cedar's ReadWithAdminBypass gate is `maxRoleWeight >= 100`; \
             holding the admin role is only equivalent while admin tops the ladder"
        );
    }

    #[test]
    fn an_in_mesh_system_caller_is_unrestricted() {
        let claims = claims(
            r#"{"sub":"system:twin-service","accountName":"system:twin-service","memberships":[]}"#,
        );
        assert!(claims.is_system());
        assert!(matches!(Audience::of(&claims), Audience::Unrestricted));
        assert!(Audience::of(&claims).permits("any-domain"));
    }

    #[test]
    fn our_own_system_identity_is_unrestricted_too() {
        let decoded = STANDARD.decode(system_claims_header()).unwrap();
        let claims = GatewayClaims {
            payload: serde_json::from_slice(&decoded).unwrap(),
            raw: String::new(),
        };
        assert!(claims.is_system());
    }

    #[test]
    fn an_ordinary_account_is_restricted_to_its_memberships() {
        let claims = claims(
            r#"{"sub":"3f2b","accountName":"ada","memberships":[{"domain":"eng","role":"a"}]}"#,
        );
        assert!(!claims.is_system());
        let audience = Audience::of(&claims);
        assert!(audience.permits("eng"));
        assert!(!audience.permits("finance"));
    }

    #[test]
    fn an_account_named_like_a_system_caller_is_not_one() {
        let claims =
            claims(r#"{"sub":"3f2b","accountName":"system:twin-service","memberships":[]}"#);
        assert!(!claims.is_system());
        assert!(!Audience::of(&claims).permits("eng"));
    }

    #[test]
    fn a_member_of_the_domain_is_recognised() {
        let claims = claims(
            r#"{"accountName":"ada","memberships":[{"domain":"eng","role":"business_admin"}]}"#,
        );
        assert!(claims.belongs_to("eng"));
    }

    #[test]
    fn a_domain_the_account_is_not_a_member_of_is_rejected() {
        let claims = claims(
            r#"{"accountName":"ada","memberships":[{"domain":"eng","role":"business_admin"}]}"#,
        );
        assert!(!claims.belongs_to("ops"));
    }

    #[test]
    fn an_account_with_no_memberships_belongs_nowhere() {
        assert!(!claims(r#"{"accountName":"ada"}"#).belongs_to("eng"));
        assert!(!claims(r#"{"accountName":"ada","memberships":[]}"#).belongs_to("eng"));
    }

    #[test]
    fn an_empty_domain_never_matches() {
        let claims = claims(r#"{"accountName":"ada","memberships":[{"domain":"","role":"x"}]}"#);
        assert!(!claims.belongs_to(""));
    }

    #[test]
    fn every_joined_domain_is_listed_once_without_the_blanks() {
        let claims = claims(
            r#"{"accountName":"ada","memberships":[
                {"domain":"eng","role":"a"},
                {"domain":"","role":"b"},
                {"domain":"ops","role":"c"},
                {"domain":"eng","role":"d"}
            ]}"#,
        );
        assert_eq!(claims.domains(), vec!["eng".to_string(), "ops".to_string()]);
    }

    #[test]
    fn a_membership_missing_its_fields_is_ignored_rather_than_failing_the_request() {
        let claims = claims(
            r#"{"accountName":"ada","memberships":[{"role":"a"},{"domain":"eng","externalId":"x"}]}"#,
        );
        assert!(claims.belongs_to("eng"));
        assert_eq!(claims.domains(), vec!["eng".to_string()]);
    }

    #[test]
    fn the_system_identity_belongs_to_no_domain() {
        let decoded = STANDARD.decode(system_claims_header()).unwrap();
        let payload: ClaimsPayload = serde_json::from_slice(&decoded).unwrap();
        let claims = GatewayClaims {
            payload,
            raw: String::new(),
        };
        assert!(claims.domains().is_empty());
    }

    #[test]
    fn system_header_matches_the_node_service_byte_for_byte() {
        assert_eq!(
            system_claims_header(),
            "eyJzdWIiOiJzeXN0ZW06bm90aWZpY2F0aW9uLXNlcnZpY2UiLCJtZW1iZXJzaGlwcyI6W119"
        );
    }

    #[test]
    fn system_header_decodes_to_an_empty_membership_array() {
        let decoded = STANDARD.decode(system_claims_header()).unwrap();
        let payload: Value = serde_json::from_slice(&decoded).unwrap();
        assert_eq!(payload["sub"], "system:notification-service");
        assert_eq!(payload["memberships"], Value::Array(vec![]));
    }
}
