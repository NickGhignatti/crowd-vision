use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Deserialize;
use serde_json::Value;

pub const CLAIMS_HEADER: &str = "x-gateway-claims";

#[derive(Debug, Clone, Deserialize)]
pub struct ClaimsPayload {
    #[serde(default)]
    pub sub: Option<String>,
    #[serde(rename = "accountName", default)]
    pub account_name: Option<String>,
    #[serde(default)]
    pub memberships: Option<Vec<Value>>,
}

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub payload: ClaimsPayload,
    pub raw: String,
}

impl GatewayClaims {
    pub fn account_name(&self) -> &str {
        self.payload
            .account_name
            .as_deref()
            .expect("claims are only constructed with a non-empty accountName")
    }
}

pub fn system_claims_header() -> String {
    STANDARD.encode(r#"{"sub":"system:notification-service","memberships":[]}"#)
}

#[cfg(test)]
mod tests {
    use super::*;

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
