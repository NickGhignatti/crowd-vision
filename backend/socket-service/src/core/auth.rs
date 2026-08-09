use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use serde::Deserialize;
use serde_json::Value;

pub const CLAIMS_HEADER: &str = "x-gateway-claims";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Identity {
    pub account_id: String,
    pub account_name: String,
    pub domains: Vec<String>,
}

#[derive(Deserialize)]
struct GatewayClaims {
    sub: Option<String>,
    #[serde(rename = "accountName")]
    account_name: Option<String>,
    #[serde(default)]
    memberships: Option<Vec<Value>>,
}

/// Decodes a base64-encoded JWT header with 4 different versions of the engine.
fn decode(header: &str) -> Option<Vec<u8>> {
    [STANDARD, URL_SAFE, STANDARD_NO_PAD, URL_SAFE_NO_PAD]
        .iter()
        .find_map(|engine| engine.decode(header).ok())
}

fn domains_of(memberships: Option<Vec<Value>>) -> Vec<String> {
    memberships
        .unwrap_or_default()
        .iter()
        .filter_map(|m| m.get("domain")?.as_str().map(str::to_string))
        .collect()
}

pub fn authenticate_claims_header(header: Option<&str>) -> Option<Identity> {
    let decoded = decode(header?)?;
    let claims: GatewayClaims = serde_json::from_slice(&decoded).ok()?;

    Some(Identity {
        account_id: claims.sub?,
        account_name: claims.account_name?,
        domains: domains_of(claims.memberships),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
