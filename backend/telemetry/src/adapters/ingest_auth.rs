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
pub const TIMESTAMP_HEADER: &str = "x-timestamp";
/// How far a collector's clock may stray; also how long a captured request stays replayable.
pub const MAX_SKEW_S: i64 = 300;

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

    /// A GET has no body, so a collector signs this canonical string instead.
    pub fn sign_collector_request(&self, timestamp: &str) -> String {
        self.sign(format!("GET /collector\n{timestamp}").as_bytes())
    }
}

/// Signed by this key, and stamped within `MAX_SKEW_S` of `now_s`.
pub fn collector_request_is_valid(
    key: &IngestKey,
    signature: &str,
    timestamp: &str,
    now_s: i64,
) -> bool {
    let fresh = timestamp
        .parse::<i64>()
        .is_ok_and(|stamped| (now_s - stamped).abs() <= MAX_SKEW_S);
    fresh && constant_time_eq(&key.sign_collector_request(timestamp), signature)
}

pub async fn verify_collector_request(
    State(key): State<IngestKey>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let valid = {
        let header = |name: &str| {
            request
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
        };
        let now_s = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs() as i64);
        collector_request_is_valid(
            &key,
            header(SIGNATURE_HEADER),
            header(TIMESTAMP_HEADER),
            now_s,
        )
    };
    match valid {
        true => Ok(next.run(request).await),
        false => Err(StatusCode::UNAUTHORIZED),
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

    const REQUEST_FIXTURE: &str =
        include_str!("../../../../schemas/fixtures/collector-request.json");

    #[test]
    fn collector_requests_sign_as_the_fixture_pins() {
        let fixture: serde_json::Value = serde_json::from_str(REQUEST_FIXTURE).unwrap();
        let key = IngestKey::new(fixture["secret"].as_str().unwrap()).unwrap();
        assert_eq!(fixture["maxSkewS"], MAX_SKEW_S);
        for case in fixture["cases"].as_array().unwrap() {
            assert_eq!(
                key.sign_collector_request(case["timestamp"].as_str().unwrap()),
                case["signature"].as_str().unwrap(),
                "{}",
                case["name"]
            );
        }
    }

    fn signed_at(timestamp: &str) -> (String, String) {
        (
            key().sign_collector_request(timestamp),
            timestamp.to_owned(),
        )
    }

    #[test]
    fn a_fresh_signed_request_is_accepted() {
        let (signature, timestamp) = signed_at("1000");
        assert!(collector_request_is_valid(
            &key(),
            &signature,
            &timestamp,
            1000 + MAX_SKEW_S
        ));
    }

    #[test]
    fn a_request_older_or_newer_than_the_skew_is_refused() {
        let (signature, timestamp) = signed_at("1000");
        assert!(!collector_request_is_valid(
            &key(),
            &signature,
            &timestamp,
            1001 + MAX_SKEW_S
        ));
        assert!(!collector_request_is_valid(
            &key(),
            &signature,
            &timestamp,
            999 - MAX_SKEW_S
        ));
    }

    #[test]
    fn a_retimed_request_or_a_bad_timestamp_is_refused() {
        let (signature, _) = signed_at("1000");
        assert!(!collector_request_is_valid(
            &key(),
            &signature,
            "1001",
            1000
        ));
        let (garbled, _) = signed_at("soon");
        assert!(!collector_request_is_valid(&key(), &garbled, "soon", 1000));
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
