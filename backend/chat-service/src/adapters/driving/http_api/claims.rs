use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use claims_contracts::decode_claims_header;

use crate::domain::{CLAIMS_HEADER, ClaimsPayload, DomainError, GatewayClaims};

fn unauthorized(message: &str) -> DomainError {
    DomainError::Unauthorized(message.to_string())
}

impl<S: Send + Sync> FromRequestParts<S> for GatewayClaims {
    type Rejection = DomainError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let raw = parts
            .headers
            .get(CLAIMS_HEADER)
            .and_then(|header| header.to_str().ok())
            .filter(|raw| !raw.is_empty())
            .ok_or_else(|| unauthorized("Missing authentication token"))?
            .to_string();

        let decoded = decode_claims_header(&raw)
            .ok_or_else(|| unauthorized("Invalid authentication token"))?;
        let payload: ClaimsPayload = serde_json::from_slice(&decoded)
            .map_err(|_| unauthorized("Invalid authentication token"))?;

        let user_id = payload
            .user_id()
            .ok_or_else(|| unauthorized("Authentication token is missing an account id"))?
            .to_string();

        Ok(GatewayClaims { user_id, raw })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use base64::Engine;
    use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};

    async fn extract(header: Option<&str>) -> Result<GatewayClaims, DomainError> {
        let mut builder = Request::builder();
        if let Some(header) = header {
            builder = builder.header(CLAIMS_HEADER, header);
        }
        let (mut parts, _) = builder.body(()).unwrap().into_parts();
        GatewayClaims::from_request_parts(&mut parts, &()).await
    }

    fn encoded(payload: &str) -> String {
        STANDARD.encode(payload)
    }

    #[tokio::test]
    async fn a_valid_header_yields_the_subject_and_the_raw_token() {
        let header = encoded(r#"{"sub":"3f2b","accountName":"ada","memberships":[]}"#);
        let claims = extract(Some(&header)).await.unwrap();

        assert_eq!(claims.user_id, "3f2b");
        assert_eq!(claims.raw, header);
    }

    #[tokio::test]
    async fn the_raw_header_is_preserved_verbatim_for_forwarding() {
        let header = encoded(r#"{"sub":"3f2b"}"#);
        assert_eq!(extract(Some(&header)).await.unwrap().raw, header);
    }

    #[tokio::test]
    async fn a_missing_header_is_unauthorized() {
        assert!(matches!(
            extract(None).await,
            Err(DomainError::Unauthorized(m)) if m == "Missing authentication token"
        ));
    }

    #[tokio::test]
    async fn an_empty_header_is_unauthorized() {
        assert!(matches!(
            extract(Some("")).await,
            Err(DomainError::Unauthorized(m)) if m == "Missing authentication token"
        ));
    }

    #[tokio::test]
    async fn a_header_that_is_not_base64_json_is_unauthorized() {
        assert!(matches!(
            extract(Some("not base64 json!!")).await,
            Err(DomainError::Unauthorized(m)) if m == "Invalid authentication token"
        ));
    }

    #[tokio::test]
    async fn base64_that_is_not_json_is_unauthorized() {
        assert!(matches!(
            extract(Some(&encoded("plain text"))).await,
            Err(DomainError::Unauthorized(m)) if m == "Invalid authentication token"
        ));
    }

    #[tokio::test]
    async fn a_url_safe_unpadded_header_is_still_accepted() {
        let header = URL_SAFE_NO_PAD.encode(r#"{"sub":"3f2b"}"#);
        assert_eq!(extract(Some(&header)).await.unwrap().user_id, "3f2b");
    }

    #[tokio::test]
    async fn a_well_formed_payload_without_a_subject_is_unauthorized() {
        let header = encoded(r#"{"accountName":"ada","memberships":[]}"#);
        assert!(matches!(
            extract(Some(&header)).await,
            Err(DomainError::Unauthorized(m)) if m == "Authentication token is missing an account id"
        ));
    }

    #[tokio::test]
    async fn a_blank_subject_is_unauthorized() {
        assert!(matches!(
            extract(Some(&encoded(r#"{"sub":"  "}"#))).await,
            Err(DomainError::Unauthorized(_))
        ));
    }
}
