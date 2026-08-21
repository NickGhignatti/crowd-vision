use serde::Deserialize;

pub const CLAIMS_HEADER: &str = "x-gateway-claims";

#[derive(Debug, Clone, Deserialize)]
pub struct ClaimsPayload {
    #[serde(default)]
    pub sub: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub user_id: String,
    pub raw: String,
}

impl ClaimsPayload {
    pub fn user_id(&self) -> Option<&str> {
        self.sub.as_deref().map(str::trim).filter(|s| !s.is_empty())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(json: &str) -> ClaimsPayload {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn the_stable_subject_claim_is_the_user_id() {
        assert_eq!(payload(r#"{"sub":"3f2b"}"#).user_id(), Some("3f2b"));
    }

    #[test]
    fn claims_carrying_other_fields_still_yield_the_subject() {
        let claims = payload(r#"{"sub":"3f2b","accountName":"ada","memberships":[]}"#);
        assert_eq!(claims.user_id(), Some("3f2b"));
    }

    #[test]
    fn a_payload_without_a_subject_has_no_user_id() {
        assert_eq!(payload(r#"{"accountName":"ada"}"#).user_id(), None);
    }

    #[test]
    fn a_blank_subject_is_not_a_user_id() {
        assert_eq!(payload(r#"{"sub":""}"#).user_id(), None);
        assert_eq!(payload(r#"{"sub":"   "}"#).user_id(), None);
    }
}
