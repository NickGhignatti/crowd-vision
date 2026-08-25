use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::fmt::Write;
use std::sync::Arc;

use crate::adapters::metrics;

pub const SIGNATURE_HEADER: &str = "x-signature";

const MAX_BODY_BYTES: usize = 1 << 20;
const MIN_SECRET_BYTES: usize = 32;

#[derive(Clone)]
pub struct IngestKey(Arc<Vec<u8>>);

impl IngestKey {
    pub fn new(secret: &str) -> anyhow::Result<Self> {
        if secret.len() < MIN_SECRET_BYTES {
            anyhow::bail!("ingest secret must be at least {MIN_SECRET_BYTES} characters");
        }
        Ok(Self(Arc::new(secret.as_bytes().to_vec())))
    }

    pub fn sign(&self, body: &[u8]) -> String {
        let mut mac =
            Hmac::<Sha256>::new_from_slice(&self.0).expect("hmac accepts keys of any length");
        mac.update(body);
        mac.finalize()
            .into_bytes()
            .iter()
            .fold(String::new(), |mut hex, byte| {
                let _ = write!(hex, "{byte:02x}");
                hex
            })
    }
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

pub async fn verify_signature(
    State(key): State<IngestKey>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let Some(signature) = request
        .headers()
        .get(SIGNATURE_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
    else {
        metrics::record_ingest("unknown", "unsigned");
        return Err(StatusCode::UNAUTHORIZED);
    };

    let (parts, body) = request.into_parts();
    let bytes = axum::body::to_bytes(body, MAX_BODY_BYTES)
        .await
        .map_err(|_| StatusCode::PAYLOAD_TOO_LARGE)?;

    if !constant_time_eq(&key.sign(&bytes), &signature) {
        metrics::record_ingest("unknown", "bad_signature");
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(next
        .run(Request::from_parts(parts, Body::from(bytes)))
        .await)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "0123456789abcdef0123456789abcdef";

    fn key() -> IngestKey {
        IngestKey::new(SECRET).unwrap()
    }

    const SIGNATURE_FIXTURE: &str =
        include_str!("../../../../schemas/fixtures/internal-signature.json");

    #[test]
    fn signatures_match_the_golden_vectors_the_go_services_assert() {
        let fixture: serde_json::Value =
            serde_json::from_str(SIGNATURE_FIXTURE).expect("fixture parses");
        let key = IngestKey::new(fixture["secret"].as_str().expect("fixture has a secret"))
            .expect("the fixture secret is long enough");

        let cases = fixture["cases"].as_array().expect("fixture has cases");
        assert!(!cases.is_empty());
        for case in cases {
            let body = case["body"].as_str().expect("case has a body");
            let expected = case["signature"].as_str().expect("case has a signature");
            assert_eq!(
                key.sign(body.as_bytes()),
                expected,
                "{}",
                case["name"].as_str().unwrap_or_default()
            );
        }
    }

    #[test]
    fn a_short_secret_is_rejected() {
        assert!(IngestKey::new("too-short").is_err());
    }

    #[test]
    fn a_signature_is_lowercase_hex_sha256() {
        let signature = key().sign(b"{}");
        assert_eq!(signature.len(), 64);
        assert!(signature.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(signature, signature.to_lowercase());
    }

    #[test]
    fn the_same_body_signs_the_same_way() {
        assert_eq!(key().sign(b"{\"a\":1}"), key().sign(b"{\"a\":1}"));
    }

    #[test]
    fn one_changed_byte_changes_the_signature() {
        assert_ne!(key().sign(b"{\"a\":1}"), key().sign(b"{\"a\":2}"));
    }

    #[test]
    fn a_different_secret_changes_the_signature() {
        let other = IngestKey::new("fedcba9876543210fedcba9876543210").unwrap();
        assert_ne!(key().sign(b"{}"), other.sign(b"{}"));
    }

    #[test]
    fn constant_time_eq_matches_identical_strings() {
        assert!(constant_time_eq("abc", "abc"));
    }

    #[test]
    fn constant_time_eq_rejects_a_different_value() {
        assert!(!constant_time_eq("abc", "abd"));
    }

    #[test]
    fn constant_time_eq_rejects_a_different_length() {
        assert!(!constant_time_eq("abc", "abcd"));
    }
}
