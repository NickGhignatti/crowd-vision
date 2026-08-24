use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use claims_contracts::decode_claims_header;

use crate::domain::DomainError;
use crate::domain::identity::{CLAIMS_HEADER, ClaimsPayload, GatewayClaims};

impl<S: Send + Sync> FromRequestParts<S> for GatewayClaims {
    type Rejection = DomainError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let invalid = || DomainError::Unauthorized("Invalid authentication token".to_string());

        let raw = parts
            .headers
            .get(CLAIMS_HEADER)
            .ok_or_else(|| DomainError::Unauthorized("Missing authentication token".to_string()))?
            .to_str()
            .map_err(|_| invalid())?
            .to_string();
        let decoded = decode_claims_header(&raw).ok_or_else(invalid)?;
        let payload: ClaimsPayload = serde_json::from_slice(&decoded).map_err(|_| invalid())?;
        if payload.user_id().is_none() {
            return Err(invalid());
        }
        Ok(GatewayClaims { payload, raw })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::FromRequestParts;
    use axum::http::Request;
    use base64::Engine;
    use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};

    fn header_value(payload: &str) -> String {
        STANDARD.encode(payload)
    }

    async fn extract(header: Option<&str>) -> Result<GatewayClaims, DomainError> {
        let mut builder = Request::builder();
        if let Some(header) = header {
            builder = builder.header(CLAIMS_HEADER, header);
        }
        let (mut parts, _) = builder.body(()).unwrap().into_parts();
        GatewayClaims::from_request_parts(&mut parts, &()).await
    }

    #[tokio::test]
    async fn extracts_valid_claims() {
        let token = header_value(r#"{"sub":"u1","memberships":[{"domain":"eng","role":"admin"}]}"#);
        let claims = extract(Some(&token)).await.unwrap();
        assert_eq!(claims.payload.user_id(), Some("u1"));
        assert_eq!(claims.payload.memberships[0].domain, "eng");
        assert_eq!(claims.raw, token);
    }

    #[tokio::test]
    async fn accepts_the_url_safe_alphabet_the_edge_may_emit() {
        let token = URL_SAFE_NO_PAD.encode(r#"{"sub":"u1"}"#);
        assert!(extract(Some(&token)).await.is_ok());
    }

    #[tokio::test]
    async fn rejects_missing_header() {
        assert!(extract(None).await.is_err());
    }

    #[tokio::test]
    async fn rejects_malformed_header() {
        assert!(extract(Some("not-valid-base64-json")).await.is_err());
    }

    #[tokio::test]
    async fn rejects_claims_without_a_subject() {
        let token = header_value(r#"{"memberships":[{"domain":"eng","role":"admin"}]}"#);
        assert!(extract(Some(&token)).await.is_err());
    }
}
