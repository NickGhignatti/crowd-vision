pub use claims_contracts::CLAIMS_HEADER;
use claims_contracts::ClaimsPayload;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub account_id: String,
    pub account_name: String,
    pub domains: Vec<String>,
}

pub fn authenticate_claims_header(header: Option<&str>) -> Option<Identity> {
    let claims = ClaimsPayload::decode(header?)?;

    Some(Identity {
        account_id: claims.user_id()?.to_string(),
        account_name: claims.account()?.to_string(),
        domains: claims.domains().map(str::to_string).collect(),
    })
}

pub fn may_read_building(identity: &Identity, building_domains: &[String]) -> bool {
    building_domains
        .iter()
        .any(|domain| identity.domains.contains(domain))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;

    fn encoded(payload: &str) -> String {
        STANDARD.encode(payload)
    }

    fn identity_from(payload: &str) -> Option<Identity> {
        authenticate_claims_header(Some(&encoded(payload)))
    }

    #[test]
    fn absent_header_is_rejected() {
        assert_eq!(authenticate_claims_header(None), None);
    }

    #[test]
    fn non_base64_header_is_rejected() {
        assert_eq!(authenticate_claims_header(Some("not base64 !!")), None);
    }

    #[test]
    fn base64_that_is_not_json_is_rejected() {
        assert_eq!(authenticate_claims_header(Some(&encoded("hello"))), None);
    }

    #[test]
    fn claims_without_sub_are_rejected() {
        assert_eq!(identity_from(r#"{"accountName":"Ada"}"#), None);
    }

    #[test]
    fn claims_without_account_name_are_rejected() {
        assert_eq!(identity_from(r#"{"sub":"u1"}"#), None);
    }

    #[test]
    fn non_string_account_name_is_rejected() {
        assert_eq!(identity_from(r#"{"sub":"u1","accountName":42}"#), None);
    }

    #[test]
    fn claims_without_memberships_yield_no_domains() {
        let identity = identity_from(r#"{"sub":"u1","accountName":"Ada"}"#).unwrap();
        assert_eq!(identity.account_id, "u1");
        assert_eq!(identity.account_name, "Ada");
        assert!(identity.domains.is_empty());
    }

    #[test]
    fn null_memberships_yield_no_domains() {
        let identity = identity_from(r#"{"sub":"u1","accountName":"Ada","memberships":null}"#);
        assert!(identity.unwrap().domains.is_empty());
    }

    #[test]
    fn memberships_with_a_non_string_domain_are_dropped_not_fatal() {
        let identity = identity_from(
            r#"{"sub":"u1","accountName":"Ada","memberships":[{"domain":7,"role":"admin"},{"domain":"acme","role":"admin"}]}"#,
        )
        .unwrap();
        assert_eq!(identity.domains, vec!["acme"]);
    }

    #[test]
    fn memberships_that_are_not_objects_are_dropped() {
        let identity = identity_from(
            r#"{"sub":"u1","accountName":"Ada","memberships":["acme",{"domain":"beta"}]}"#,
        )
        .unwrap();
        assert_eq!(identity.domains, vec!["beta"]);
    }

    #[test]
    fn valid_claims_map_sub_and_membership_domains() {
        let identity = identity_from(
            r#"{"sub":"u1","accountName":"Ada","sid":"s1","memberships":[{"domain":"acme","role":"admin"},{"domain":"beta","role":"viewer"}]}"#,
        )
        .unwrap();
        assert_eq!(
            identity,
            Identity {
                account_id: "u1".to_string(),
                account_name: "Ada".to_string(),
                domains: vec!["acme".to_string(), "beta".to_string()],
            }
        );
    }

    fn identity_with(domains: &[&str]) -> Identity {
        Identity {
            account_id: "u1".to_string(),
            account_name: "Ada".to_string(),
            domains: domains.iter().map(|d| d.to_string()).collect(),
        }
    }

    fn owned(domains: &[&str]) -> Vec<String> {
        domains.iter().map(|d| d.to_string()).collect()
    }

    #[test]
    fn a_shared_domain_permits_the_read() {
        assert!(may_read_building(
            &identity_with(&["acme"]),
            &owned(&["acme"])
        ));
    }

    #[test]
    fn a_disjoint_domain_denies_the_read() {
        assert!(!may_read_building(
            &identity_with(&["beta"]),
            &owned(&["acme"])
        ));
    }

    #[test]
    fn one_shared_domain_is_enough_when_the_building_has_several() {
        assert!(may_read_building(
            &identity_with(&["beta"]),
            &owned(&["acme", "beta"])
        ));
    }

    #[test]
    fn one_shared_domain_is_enough_when_the_caller_has_several() {
        assert!(may_read_building(
            &identity_with(&["beta", "acme"]),
            &owned(&["acme"])
        ));
    }

    #[test]
    fn a_building_with_no_domains_is_denied_to_everyone() {
        assert!(!may_read_building(&identity_with(&["acme"]), &[]));
    }

    #[test]
    fn a_caller_with_no_memberships_is_denied() {
        assert!(!may_read_building(&identity_with(&[]), &owned(&["acme"])));
    }
}
