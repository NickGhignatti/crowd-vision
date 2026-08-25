use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::core::auth::CLAIMS_HEADER;

const TTL: Duration = Duration::from_secs(60);
const TIMEOUT: Duration = Duration::from_secs(2);
const RETRY_BACKOFF: Duration = Duration::from_millis(50);
const RETRY_JITTER_MS: u64 = 50;

pub struct BuildingDomains {
    base_url: String,
    client: reqwest::Client,
    cache: Mutex<HashMap<String, (Instant, Vec<String>)>>,
    gates: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

/// Spreads a fleet's retries instead of having every pod come back at the same
/// instant. Taken from the clock rather than a `rand` dependency: this needs to
/// be uneven, not unpredictable.
fn backoff() -> Duration {
    let jitter = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| u64::from(since.subsec_nanos()) % RETRY_JITTER_MS)
        .unwrap_or(0);
    RETRY_BACKOFF + Duration::from_millis(jitter)
}

impl BuildingDomains {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .expect("an HTTP client with a timeout is constructible"),
            cache: Mutex::new(HashMap::new()),
            gates: Mutex::new(HashMap::new()),
        }
    }

    /// One lookup per building at a time. A subscribe storm after a deploy is
    /// exactly when digital-twin is slowest, and without this every socket in
    /// that storm asks it the same question separately.
    fn gate(&self, building_id: &str) -> Arc<tokio::sync::Mutex<()>> {
        self.gates
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(building_id.to_owned())
            .or_default()
            .clone()
    }

    fn cached(&self, building_id: &str) -> Option<Vec<String>> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let (fetched_at, domains) = cache.get(building_id)?;
        (fetched_at.elapsed() < TTL).then(|| domains.clone())
    }

    fn remember(&self, building_id: &str, domains: &[String]) {
        self.cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(building_id.to_owned(), (Instant::now(), domains.to_vec()));
    }

    fn url(&self, building_id: &str) -> Option<reqwest::Url> {
        let mut url = reqwest::Url::parse(&self.base_url).ok()?;
        url.path_segments_mut()
            .ok()?
            .push("domain")
            .push(building_id);
        Some(url)
    }

    pub async fn of(&self, building_id: &str, claims: &str) -> Option<Vec<String>> {
        if let Some(domains) = self.cached(building_id) {
            return Some(domains);
        }

        let gate = self.gate(building_id);
        let _lookup = gate.lock().await;
        // Whoever held the gate may have just answered this exact question.
        if let Some(domains) = self.cached(building_id) {
            return Some(domains);
        }

        // One retry, because a GET is safe to repeat and a dropped connection
        // should not cost a subscriber its dashboard. Transport failures and
        // 5xx only: a 404 means the building is not there, and asking again
        // will not change that.
        let mut attempts = 0;
        let response = loop {
            let outcome = self
                .client
                .get(self.url(building_id)?)
                .header(CLAIMS_HEADER, claims)
                .send()
                .await;

            let worth_retrying = match &outcome {
                Err(_) => true,
                Ok(response) => response.status().is_server_error(),
            };
            if worth_retrying && attempts == 0 {
                attempts += 1;
                tokio::time::sleep(backoff()).await;
                continue;
            }
            break outcome
                .inspect_err(|error| {
                    log::warn!("digital-twin unreachable for {building_id}: {error}")
                })
                .ok()?;
        };

        if !response.status().is_success() {
            log::warn!(
                "digital-twin answered {} for {building_id}",
                response.status()
            );
            return None;
        }

        let domains: Vec<String> = response
            .json()
            .await
            .inspect_err(|error| log::warn!("digital-twin sent no domain list: {error}"))
            .ok()?;

        self.remember(building_id, &domains);
        Some(domains)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn directory() -> BuildingDomains {
        BuildingDomains::new("http://digital-twin:3000".to_string())
    }

    #[test]
    fn the_lookup_url_is_the_domain_route_of_the_building() {
        assert_eq!(
            directory().url("b1").unwrap().as_str(),
            "http://digital-twin:3000/domain/b1"
        );
    }

    #[test]
    fn a_building_id_with_a_slash_cannot_escape_the_domain_route() {
        assert_eq!(
            directory().url("../buildings").unwrap().as_str(),
            "http://digital-twin:3000/domain/..%2Fbuildings"
        );
    }

    #[test]
    fn a_building_id_keeps_the_colons_that_belong_to_it() {
        assert_eq!(
            directory().url("site:b1").unwrap().as_str(),
            "http://digital-twin:3000/domain/site:b1"
        );
    }

    #[test]
    fn a_remembered_answer_is_read_back() {
        let directory = directory();
        directory.remember("b1", &["acme".to_string()]);
        assert_eq!(directory.cached("b1"), Some(vec!["acme".to_string()]));
    }

    #[test]
    fn an_empty_answer_is_remembered_too() {
        let directory = directory();
        directory.remember("unknown", &[]);
        assert_eq!(directory.cached("unknown"), Some(vec![]));
    }

    #[test]
    fn a_building_never_looked_up_is_not_cached() {
        assert_eq!(directory().cached("b1"), None);
    }

    #[tokio::test]
    async fn a_server_error_is_retried_once_and_then_succeeds() {
        let server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/domain/b1"))
            .respond_with(wiremock::ResponseTemplate::new(503))
            .up_to_n_times(1)
            .with_priority(1)
            .mount(&server)
            .await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/domain/b1"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(["acme"]))
            .with_priority(2)
            .mount(&server)
            .await;

        let domains = BuildingDomains::new(server.uri()).of("b1", "claims").await;

        assert_eq!(domains, Some(vec!["acme".to_string()]));
        assert_eq!(server.received_requests().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn a_missing_building_is_not_retried() {
        let server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/domain/b1"))
            .respond_with(wiremock::ResponseTemplate::new(404))
            .mount(&server)
            .await;

        assert_eq!(
            BuildingDomains::new(server.uri()).of("b1", "claims").await,
            None
        );
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn concurrent_subscribers_to_one_building_make_a_single_request() {
        let server = wiremock::MockServer::start().await;
        wiremock::Mock::given(wiremock::matchers::method("GET"))
            .and(wiremock::matchers::path("/domain/b1"))
            .respond_with(
                wiremock::ResponseTemplate::new(200)
                    .set_body_json(["acme"])
                    .set_delay(Duration::from_millis(300)),
            )
            .mount(&server)
            .await;

        let directory = Arc::new(BuildingDomains::new(server.uri()));
        let lookups: Vec<_> = (0..5)
            .map(|_| {
                let directory = directory.clone();
                tokio::spawn(async move { directory.of("b1", "claims").await })
            })
            .collect();

        for lookup in lookups {
            assert_eq!(lookup.await.unwrap(), Some(vec!["acme".to_string()]));
        }
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
    }
}
