use axum::body::Body;
use axum::extract::{Query, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::Response;
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use std::fmt::Write;
use std::sync::Arc;

use crate::adapters::metrics;
use crate::kernel::ports::DeviceKeyStore;
use serde::Deserialize;

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
}

/// What a collector signs for `GET /collector`: a GET has no body, so a canonical string.
pub fn collector_message(building_id: Option<&str>, timestamp: &str) -> String {
    format!(
        "GET /collector\n{}\n{timestamp}",
        building_id.unwrap_or_default()
    )
}

/// Stamped within `MAX_SKEW_S` of `now_s`.
pub fn is_fresh(timestamp: &str, now_s: i64) -> bool {
    timestamp
        .parse::<i64>()
        .is_ok_and(|stamped| (now_s - stamped).abs() <= MAX_SKEW_S)
}

/// Per-building device keys, derived from one master key, plus the shared key where configured.
#[derive(Clone)]
pub struct DeviceKeys {
    master: IngestKey,
    shared: Option<IngestKey>,
    epochs: Arc<dyn DeviceKeyStore>,
}

impl DeviceKeys {
    pub fn new(
        master: &str,
        shared: Option<&str>,
        epochs: Arc<dyn DeviceKeyStore>,
    ) -> anyhow::Result<Self> {
        Ok(Self {
            master: IngestKey::new(master)?,
            shared: shared.map(IngestKey::new).transpose()?,
            epochs,
        })
    }

    /// The building's key at `epoch`: hex HMAC(master, "{building}:{epoch}").
    pub fn derive(&self, building_id: &str, epoch: i32) -> String {
        self.master
            .sign(format!("{building_id}:{epoch}").as_bytes())
    }

    /// Revokes the building's key and returns its new one; `None` when it is not registered.
    pub async fn issue(&self, building_id: &str) -> anyhow::Result<Option<String>> {
        let epoch = self.epochs.rotate(building_id).await?;
        Ok(epoch.map(|epoch| self.derive(building_id, epoch)))
    }

    /// Signed by the shared key, or by `building_id`'s current key.
    pub async fn accepts(
        &self,
        building_id: Option<&str>,
        message: &[u8],
        signature: &str,
    ) -> bool {
        let signed_by = |key: &IngestKey| constant_time_eq(&key.sign(message), signature);
        if self.shared.as_ref().is_some_and(signed_by) {
            return true;
        }
        let Some(building_id) = building_id else {
            return false;
        };
        match self.epochs.epoch(building_id).await {
            Ok(Some(epoch)) => {
                IngestKey::new(&self.derive(building_id, epoch)).is_ok_and(|key| signed_by(&key))
            }
            Ok(None) => false,
            Err(error) => {
                log::warn!("device key epoch unreadable for {building_id}: {error:?}");
                false
            }
        }
    }
}

#[derive(Deserialize)]
pub struct CollectorQuery {
    #[serde(rename = "buildingId")]
    pub building_id: Option<String>,
}

pub async fn verify_collector_request(
    State(keys): State<DeviceKeys>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let (building, message, signature, fresh) = {
        let header = |name: &str| {
            request
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .to_owned()
        };
        let now_s = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs() as i64);
        let building = Query::<CollectorQuery>::try_from_uri(request.uri())
            .map_err(|_| StatusCode::BAD_REQUEST)?
            .0
            .building_id;
        let timestamp = header(TIMESTAMP_HEADER);
        let message = collector_message(building.as_deref(), &timestamp);
        let fresh = is_fresh(&timestamp, now_s);
        (building, message, header(SIGNATURE_HEADER), fresh)
    };
    let signed = keys
        .accepts(building.as_deref(), message.as_bytes(), &signature)
        .await;
    match fresh && signed {
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

#[derive(Deserialize)]
struct Addressed {
    #[serde(rename = "buildingId")]
    building_id: String,
}

pub async fn verify_signature(
    State(keys): State<DeviceKeys>,
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

    // Read only to pick the key; the handler still validates the whole body.
    let building = serde_json::from_slice::<Addressed>(&bytes).ok();
    let building_id = building.as_ref().map(|b| b.building_id.as_str());
    if !keys.accepts(building_id, &bytes, &signature).await {
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
    use crate::kernel::fakes::FakeDeviceKeys;

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

    #[tokio::test]
    async fn collector_requests_sign_as_the_fixture_pins() {
        let fixture: serde_json::Value = serde_json::from_str(REQUEST_FIXTURE).unwrap();
        let shared = IngestKey::new(fixture["secret"].as_str().unwrap()).unwrap();
        assert_eq!(fixture["maxSkewS"], MAX_SKEW_S);
        for case in fixture["cases"].as_array().unwrap() {
            let building = case["buildingId"].as_str().filter(|b| !b.is_empty());
            let message = collector_message(building, case["timestamp"].as_str().unwrap());
            assert_eq!(
                shared.sign(message.as_bytes()),
                case["signature"].as_str().unwrap(),
                "{}",
                case["name"]
            );
        }
    }

    #[test]
    fn a_timestamp_is_fresh_only_within_the_skew() {
        assert!(is_fresh("1000", 1000 + MAX_SKEW_S));
        assert!(is_fresh("1000", 1000 - MAX_SKEW_S));
        assert!(!is_fresh("1000", 1001 + MAX_SKEW_S));
        assert!(!is_fresh("1000", 999 - MAX_SKEW_S));
        assert!(!is_fresh("soon", 1000));
    }

    const MASTER: &str = "a-device-master-key-that-is-at-least-32-bytes";

    fn keys(shared: Option<&str>) -> DeviceKeys {
        let epochs = Arc::new(FakeDeviceKeys::registered(&[
            "bldg-3f2b4c5d",
            "bldg-9a8b7c6d",
        ]));
        DeviceKeys::new(MASTER, shared, epochs).unwrap()
    }

    #[test]
    fn a_building_key_is_hmac_of_its_id_and_epoch_under_the_master_key() {
        let keys = keys(None);
        assert_eq!(
            keys.derive("bldg-3f2b4c5d", 0),
            "b42c3c8cd51584926a35e21ad0e106796e41b6b4bd19333c8b02a203ed34aa3a"
        );
        assert_eq!(
            keys.derive("bldg-3f2b4c5d", 1),
            "f7d42c6926e516f7aaded3441173fe0a59c7b9b860838549cb5b07d4b04def6b"
        );
        assert_eq!(
            keys.derive("bldg-9a8b7c6d", 0),
            "c33a7441dbbd659135d8672c14052891ea2451382a0c16532508b9a9d179fb8f"
        );
    }

    fn signed_by(key: &str, message: &[u8]) -> String {
        IngestKey::new(key).unwrap().sign(message)
    }

    #[tokio::test]
    async fn a_building_key_signs_for_its_own_building_only() {
        let keys = keys(None);
        let signature = signed_by(&keys.derive("bldg-3f2b4c5d", 0), b"tick");
        assert!(
            keys.accepts(Some("bldg-3f2b4c5d"), b"tick", &signature)
                .await
        );
        assert!(
            !keys
                .accepts(Some("bldg-9a8b7c6d"), b"tick", &signature)
                .await
        );
        assert!(!keys.accepts(None, b"tick", &signature).await);
    }

    #[tokio::test]
    async fn rotating_a_building_revokes_its_previous_key() {
        let epochs = Arc::new(FakeDeviceKeys::registered(&["bldg-3f2b4c5d"]));
        let keys = DeviceKeys::new(MASTER, None, epochs.clone()).unwrap();
        let old = signed_by(&keys.derive("bldg-3f2b4c5d", 0), b"tick");

        let fresh = keys.issue("bldg-3f2b4c5d").await.unwrap().unwrap();

        assert!(!keys.accepts(Some("bldg-3f2b4c5d"), b"tick", &old).await);
        let new = signed_by(&fresh, b"tick");
        assert!(keys.accepts(Some("bldg-3f2b4c5d"), b"tick", &new).await);
    }

    #[tokio::test]
    async fn an_unregistered_building_has_no_key_to_issue_or_accept() {
        let keys = keys(None);
        assert_eq!(keys.issue("ghost").await.unwrap(), None);
        let forged = signed_by(&keys.derive("ghost", 0), b"tick");
        assert!(!keys.accepts(Some("ghost"), b"tick", &forged).await);
    }

    #[tokio::test]
    async fn the_shared_key_signs_for_any_building_only_when_configured() {
        let with_shared = keys(Some(SECRET));
        let signature = key().sign(b"tick");
        assert!(
            with_shared
                .accepts(Some("bldg-9a8b7c6d"), b"tick", &signature)
                .await
        );
        assert!(with_shared.accepts(None, b"tick", &signature).await);
        assert!(
            !keys(None)
                .accepts(Some("bldg-9a8b7c6d"), b"tick", &signature)
                .await
        );
    }

    #[test]
    fn a_short_master_key_is_rejected() {
        let epochs = Arc::new(FakeDeviceKeys::default());
        assert!(DeviceKeys::new("too-short", None, epochs).is_err());
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
