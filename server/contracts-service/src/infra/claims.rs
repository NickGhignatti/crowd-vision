use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use serde::Deserialize;

pub const CLAIMS_HEADER: &str = "x-gateway-claims";

fn decode_claims_header(raw: &str) -> Option<Vec<u8>> {
    [STANDARD, URL_SAFE, STANDARD_NO_PAD, URL_SAFE_NO_PAD]
        .iter()
        .find_map(|engine| engine.decode(raw).ok())
}

// sub/payload aren't read by any handler yet — GatewayClaims is only used to reject
// requests with an absent or malformed claims header; routes don't scope by identity yet.
#[derive(Debug, Clone, Deserialize)]
pub struct ClaimsPayload {
    #[allow(dead_code)]
    pub sub: String,
}

// Trusts claims the mesh already verified at the edge and injected as x-gateway-claims.
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
        let decoded = decode_claims_header(raw).ok_or(StatusCode::UNAUTHORIZED)?;
        let payload: ClaimsPayload =
            serde_json::from_slice(&decoded).map_err(|_| StatusCode::UNAUTHORIZED)?;
        Ok(GatewayClaims { payload })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;

    fn header_value(payload: &str) -> String {
        STANDARD.encode(payload)
    }

    #[tokio::test]
    async fn extracts_valid_claims() {
        let token = header_value(r#"{"sub":"u1","memberships":[{"domain":"eng"}]}"#);
        let req = Request::builder()
            .header(CLAIMS_HEADER, &token)
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let claims = GatewayClaims::from_request_parts(&mut parts, &())
            .await
            .unwrap();
        assert_eq!(claims.payload.sub, "u1");
    }

    #[tokio::test]
    async fn rejects_missing_header() {
        let req = Request::builder().body(()).unwrap();
        let (mut parts, _) = req.into_parts();
        let err = GatewayClaims::from_request_parts(&mut parts, &())
            .await
            .unwrap_err();
        assert_eq!(err, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn rejects_malformed_header() {
        let req = Request::builder()
            .header(CLAIMS_HEADER, "not-valid-base64-json")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let err = GatewayClaims::from_request_parts(&mut parts, &())
            .await
            .unwrap_err();
        assert_eq!(err, StatusCode::UNAUTHORIZED);
    }
}
