use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

pub const CLAIMS_HEADER: &str = "x-gateway-claims";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Membership {
    pub domain: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(
        rename = "externalId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub external_id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClaimsPayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub: Option<String>,
    #[serde(
        rename = "accountName",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub account_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sid: Option<String>,
    #[serde(default, deserialize_with = "lenient_memberships")]
    pub memberships: Vec<Membership>,
}

fn lenient_memberships<'de, D>(deserializer: D) -> Result<Vec<Membership>, D::Error>
where
    D: Deserializer<'de>,
{
    let entries = Option::<Vec<Value>>::deserialize(deserializer)?.unwrap_or_default();
    Ok(entries
        .into_iter()
        .filter_map(|entry| serde_json::from_value(entry).ok())
        .collect())
}

pub fn decode_claims_header(header: &str) -> Option<Vec<u8>> {
    [STANDARD, URL_SAFE, STANDARD_NO_PAD, URL_SAFE_NO_PAD]
        .iter()
        .find_map(|engine| engine.decode(header).ok())
}

fn present(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

impl ClaimsPayload {
    pub fn decode(header: &str) -> Option<Self> {
        serde_json::from_slice(&decode_claims_header(header)?).ok()
    }

    pub fn user_id(&self) -> Option<&str> {
        present(self.sub.as_deref())
    }

    pub fn account(&self) -> Option<&str> {
        present(self.account_name.as_deref())
    }

    pub fn session_id(&self) -> Option<&str> {
        present(self.sid.as_deref())
    }

    pub fn domains(&self) -> impl Iterator<Item = &str> {
        self.memberships
            .iter()
            .map(|membership| membership.domain.as_str())
    }

    pub fn role_in(&self, domain: &str) -> Option<&str> {
        self.memberships
            .iter()
            .find(|membership| membership.domain == domain)
            .and_then(|membership| membership.role.as_deref())
    }

    pub fn belongs_to(&self, domain: &str) -> bool {
        !domain.is_empty()
            && self
                .memberships
                .iter()
                .any(|membership| membership.domain == domain)
    }

    pub fn has_role(&self, role: &str) -> bool {
        self.memberships
            .iter()
            .any(|membership| membership.role.as_deref() == Some(role))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encoded(payload: &str) -> String {
        STANDARD.encode(payload)
    }

    fn payload(json: &str) -> ClaimsPayload {
        ClaimsPayload::decode(&encoded(json)).expect("fixture decodes")
    }

    #[test]
    fn every_base64_alphabet_the_edge_may_emit_is_accepted() {
        let json = r#"{"sub":"u1","accountName":"ada"}"#;
        for engine in [STANDARD, URL_SAFE, STANDARD_NO_PAD, URL_SAFE_NO_PAD] {
            let header = engine.encode(json);
            assert_eq!(
                ClaimsPayload::decode(&header).and_then(|c| c.user_id().map(str::to_owned)),
                Some("u1".to_string()),
            );
        }
    }

    #[test]
    fn a_header_that_is_not_base64_does_not_decode() {
        assert!(ClaimsPayload::decode("not base64 !!").is_none());
    }

    #[test]
    fn base64_that_is_not_json_does_not_decode() {
        assert!(ClaimsPayload::decode(&encoded("hello")).is_none());
    }

    #[test]
    fn the_full_stable_claims_contract_round_trips() {
        let claims = payload(
            r#"{"sub":"u1","accountName":"ada","sid":"s1",
                "memberships":[{"domain":"acme","role":"admin","externalId":"eppn:ada@acme"}]}"#,
        );
        assert_eq!(claims.user_id(), Some("u1"));
        assert_eq!(claims.account(), Some("ada"));
        assert_eq!(claims.session_id(), Some("s1"));
        assert_eq!(
            claims.memberships,
            vec![Membership {
                domain: "acme".to_string(),
                role: Some("admin".to_string()),
                external_id: Some("eppn:ada@acme".to_string()),
            }],
        );
    }

    #[test]
    fn absent_and_blank_fields_are_absent_not_empty_strings() {
        assert_eq!(payload(r#"{"accountName":"ada"}"#).user_id(), None);
        assert_eq!(payload(r#"{"sub":"   "}"#).user_id(), None);
        assert_eq!(payload(r#"{"sub":"u1"}"#).account(), None);
        assert_eq!(payload(r#"{"sub":"u1","sid":""}"#).session_id(), None);
    }

    #[test]
    fn absent_or_null_memberships_are_an_empty_list() {
        assert!(payload(r#"{"sub":"u1"}"#).memberships.is_empty());
        assert!(
            payload(r#"{"sub":"u1","memberships":null}"#)
                .memberships
                .is_empty()
        );
    }

    #[test]
    fn a_malformed_membership_is_dropped_and_the_rest_survive() {
        let claims = payload(
            r#"{"sub":"u1","memberships":["acme",{"domain":7},{"role":"admin"},{"domain":"beta"}]}"#,
        );
        assert_eq!(claims.domains().collect::<Vec<_>>(), vec!["beta"]);
    }

    #[test]
    fn memberships_that_are_not_a_list_reject_the_whole_payload() {
        assert!(ClaimsPayload::decode(&encoded(r#"{"sub":"u1","memberships":"acme"}"#)).is_none());
    }

    #[test]
    fn roles_are_scoped_to_the_domain_they_were_granted_in() {
        let claims = payload(
            r#"{"sub":"u1","memberships":[{"domain":"acme","role":"business_admin"},{"domain":"unibo","role":"standard_customer"}]}"#,
        );
        assert_eq!(claims.role_in("acme"), Some("business_admin"));
        assert_eq!(claims.role_in("unibo"), Some("standard_customer"));
        assert_eq!(claims.role_in("someone-elses-domain"), None);
        assert!(claims.belongs_to("acme"));
        assert!(!claims.belongs_to("someone-elses-domain"));
        assert!(!claims.belongs_to(""));
        assert!(claims.has_role("business_admin"));
        assert!(!claims.has_role("admin"));
    }

    #[test]
    fn a_membership_without_a_role_still_grants_the_domain() {
        let claims = payload(r#"{"sub":"u1","memberships":[{"domain":"acme"}]}"#);
        assert!(claims.belongs_to("acme"));
        assert_eq!(claims.role_in("acme"), None);
    }
}
