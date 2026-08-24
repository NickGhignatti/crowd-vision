use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
pub use claims_contracts::{CLAIMS_HEADER, ClaimsPayload};

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    #[allow(dead_code)]
    pub payload: ClaimsPayload,
}

impl<S: Send + Sync> FromRequestParts<S> for GatewayClaims {
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let raw = parts
            .headers
            .get(CLAIMS_HEADER)
            .and_then(|value| value.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;
        let payload = ClaimsPayload::decode(raw).ok_or(StatusCode::UNAUTHORIZED)?;
        if payload.user_id().is_none() {
            return Err(StatusCode::UNAUTHORIZED);
        }
        Ok(GatewayClaims { payload })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use base64::Engine;
    use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};

    async fn extract(header: Option<&str>) -> Result<GatewayClaims, StatusCode> {
        let mut builder = Request::builder();
        if let Some(header) = header {
            builder = builder.header(CLAIMS_HEADER, header);
        }
        let (mut parts, _) = builder.body(()).unwrap().into_parts();
        GatewayClaims::from_request_parts(&mut parts, &()).await
    }

    #[tokio::test]
    async fn extracts_valid_claims() {
        let token = STANDARD.encode(r#"{"sub":"u1","memberships":[{"domain":"eng"}]}"#);
        let claims = extract(Some(&token)).await.unwrap();
        assert_eq!(claims.payload.user_id(), Some("u1"));
    }

    #[tokio::test]
    async fn accepts_the_url_safe_alphabet_the_edge_may_emit() {
        let token = URL_SAFE_NO_PAD.encode(r#"{"sub":"u1"}"#);
        assert!(extract(Some(&token)).await.is_ok());
    }

    #[tokio::test]
    async fn rejects_missing_header() {
        assert_eq!(extract(None).await.unwrap_err(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_malformed_header() {
        assert_eq!(
            extract(Some("not-valid-base64-json")).await.unwrap_err(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn rejects_claims_without_a_subject() {
        let token = STANDARD.encode(r#"{"accountName":"ada"}"#);
        assert_eq!(
            extract(Some(&token)).await.unwrap_err(),
            StatusCode::UNAUTHORIZED
        );
    }
}
