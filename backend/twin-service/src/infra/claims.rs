use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD};
use serde::Deserialize;

use crate::models::AppError;

pub const CLAIMS_HEADER: &str = "x-gateway-claims";

fn decode_claims_header(raw: &str) -> Option<Vec<u8>> {
    [STANDARD, URL_SAFE, STANDARD_NO_PAD, URL_SAFE_NO_PAD]
        .iter()
        .find_map(|engine| engine.decode(raw).ok())
}

#[derive(Debug, Clone, Deserialize)]
pub struct Membership {
    pub domain: String,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClaimsPayload {
    pub sub: String,
    #[serde(default)]
    pub memberships: Vec<Membership>,
}

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub payload: ClaimsPayload,
    pub raw: String,
}

impl<S: Send + Sync> FromRequestParts<S> for GatewayClaims {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(CLAIMS_HEADER)
            .ok_or_else(|| AppError::Unauthorized("Missing authentication token".to_string()))?;
        let raw = header
            .to_str()
            .map_err(|_| AppError::Unauthorized("Invalid authentication token".to_string()))?
            .to_string();
        let decoded = decode_claims_header(&raw)
            .ok_or_else(|| AppError::Unauthorized("Invalid authentication token".to_string()))?;
        let payload: ClaimsPayload = serde_json::from_slice(&decoded)
            .map_err(|_| AppError::Unauthorized("Invalid authentication token".to_string()))?;
        Ok(GatewayClaims { payload, raw })
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
        let token = header_value(r#"{"sub":"u1","memberships":[{"domain":"eng","role":"admin"}]}"#);
        let req = Request::builder()
            .header(CLAIMS_HEADER, &token)
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        let claims = GatewayClaims::from_request_parts(&mut parts, &())
            .await
            .unwrap();
        assert_eq!(claims.payload.sub, "u1");
        assert_eq!(claims.payload.memberships[0].domain, "eng");
        assert_eq!(claims.raw, token);
    }

    #[tokio::test]
    async fn rejects_missing_header() {
        let req = Request::builder().body(()).unwrap();
        let (mut parts, _) = req.into_parts();
        assert!(
            GatewayClaims::from_request_parts(&mut parts, &())
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn rejects_malformed_base64() {
        let req = Request::builder()
            .header(CLAIMS_HEADER, "not-valid-base64-json")
            .body(())
            .unwrap();
        let (mut parts, _) = req.into_parts();
        assert!(
            GatewayClaims::from_request_parts(&mut parts, &())
                .await
                .is_err()
        );
    }
}
