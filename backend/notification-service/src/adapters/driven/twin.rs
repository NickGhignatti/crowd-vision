use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::domain::CLAIMS_HEADER;
use crate::service::ports::DomainDirectory;

const TIMEOUT: Duration = Duration::from_secs(2);
const TTL: Duration = Duration::from_secs(15 * 60);
const RETRY_BACKOFF: Duration = Duration::from_millis(50);
const RETRY_JITTER_MS: u64 = 50;

pub struct TwinDirectory {
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

impl TwinDirectory {
    pub fn new(base_url: String) -> Self {
        TwinDirectory {
            base_url,
            client: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .expect("an HTTP client with a timeout is constructible"),
            cache: Mutex::new(HashMap::new()),
            gates: Mutex::new(HashMap::new()),
        }
    }

    /// One lookup per building at a time. Without this, N concurrent misses on
    /// the same building become N requests — precisely when twin-service is
    /// already slow enough for them to pile up.
    fn gate(&self, building_name: &str) -> Arc<tokio::sync::Mutex<()>> {
        self.gates
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(building_name.to_owned())
            .or_default()
            .clone()
    }

    /// One retry, because a GET is safe to repeat and a single dropped
    /// connection should not cost an alert its routing. Transport failures and
    /// 5xx only: a 404 means the building is not there, and asking twice will
    /// not change that.
    async fn fetch(&self, building_name: &str, claims_header: &str) -> anyhow::Result<Vec<String>> {
        let url = format!(
            "{}/domain/{}",
            self.base_url,
            urlencoding::encode(building_name)
        );

        let mut attempts = 0;
        let response = loop {
            let outcome = self
                .client
                .get(&url)
                .header(CLAIMS_HEADER, claims_header)
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
            break outcome?;
        };

        if !response.status().is_success() {
            anyhow::bail!("Twin lookup failed for building {building_name}");
        }
        Ok(response.json().await?)
    }

    fn cached(&self, building_name: &str) -> Option<Vec<String>> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let (fetched_at, domains) = cache.get(building_name)?;
        (fetched_at.elapsed() < TTL).then(|| domains.clone())
    }

    fn remember(&self, building_name: &str, domains: &[String]) {
        self.cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(building_name.to_owned(), (Instant::now(), domains.to_vec()));
    }
}

#[async_trait]
impl DomainDirectory for TwinDirectory {
    async fn domains_for_building(
        &self,
        building_name: &str,
        claims_header: &str,
    ) -> anyhow::Result<Vec<String>> {
        if let Some(domains) = self.cached(building_name) {
            return Ok(domains);
        }

        let gate = self.gate(building_name);
        let _lookup = gate.lock().await;
        // Whoever held the gate may have just answered this exact question.
        if let Some(domains) = self.cached(building_name) {
            return Ok(domains);
        }

        let domains = self.fetch(building_name, claims_header).await?;
        if !domains.is_empty() {
            self.remember(building_name, &domains);
        }
        Ok(domains)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    async fn server() -> MockServer {
        MockServer::start().await
    }

    #[tokio::test]
    async fn a_building_resolves_to_its_domains() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .and(header(CLAIMS_HEADER, "claims"))
            .respond_with(ResponseTemplate::new(200).set_body_json(["domain-a", "domain-b"]))
            .mount(&server)
            .await;

        let domains = TwinDirectory::new(server.uri())
            .domains_for_building("b1", "claims")
            .await
            .unwrap();

        assert_eq!(domains, vec!["domain-a", "domain-b"]);
    }

    #[tokio::test]
    async fn a_building_name_with_spaces_is_url_encoded() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/main%20hall"))
            .respond_with(ResponseTemplate::new(200).set_body_json([] as [&str; 0]))
            .mount(&server)
            .await;

        let domains = TwinDirectory::new(server.uri())
            .domains_for_building("main hall", "claims")
            .await
            .unwrap();

        assert!(domains.is_empty());
    }

    #[tokio::test]
    async fn a_stalled_twin_service_times_out_instead_of_hanging() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(200).set_delay(TIMEOUT * 5))
            .mount(&server)
            .await;

        let started = std::time::Instant::now();
        let result = TwinDirectory::new(server.uri())
            .domains_for_building("b1", "claims")
            .await;

        assert!(result.is_err());
        assert!(started.elapsed() < TIMEOUT * 3);
    }

    #[tokio::test]
    async fn a_repeated_lookup_is_served_from_the_cache() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(["domain-a"]))
            .expect(1)
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());
        let first = directory
            .domains_for_building("b1", "claims")
            .await
            .unwrap();
        let second = directory
            .domains_for_building("b1", "claims")
            .await
            .unwrap();

        assert_eq!(first, second);
        assert_eq!(second, vec!["domain-a"]);
    }

    #[tokio::test]
    async fn each_building_is_cached_separately() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(["domain-a"]))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/domain/b2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(["domain-b"]))
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());

        assert_eq!(
            directory
                .domains_for_building("b1", "claims")
                .await
                .unwrap(),
            vec!["domain-a"]
        );
        assert_eq!(
            directory
                .domains_for_building("b2", "claims")
                .await
                .unwrap(),
            vec!["domain-b"]
        );
    }

    #[tokio::test]
    async fn a_building_in_no_domain_is_not_cached() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(200).set_body_json([] as [&str; 0]))
            .expect(2)
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());
        assert!(
            directory
                .domains_for_building("b1", "claims")
                .await
                .unwrap()
                .is_empty()
        );
        assert!(
            directory
                .domains_for_building("b1", "claims")
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn a_failed_lookup_is_not_cached() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(502))
            // Two lookups, each costing an attempt and its one retry: nothing
            // was cached in between, which is the point.
            .expect(4)
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());
        assert!(
            directory
                .domains_for_building("b1", "claims")
                .await
                .is_err()
        );
        assert!(
            directory
                .domains_for_building("b1", "claims")
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn a_non_success_status_is_an_error() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(502))
            .mount(&server)
            .await;

        assert!(
            TwinDirectory::new(server.uri())
                .domains_for_building("b1", "claims")
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn a_server_error_is_retried_once_and_then_succeeds() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(503))
            .up_to_n_times(1)
            .with_priority(1)
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(["eng"]))
            .with_priority(2)
            .mount(&server)
            .await;

        let domains = TwinDirectory::new(server.uri())
            .domains_for_building("b1", "claims")
            .await
            .unwrap();

        assert_eq!(domains, vec!["eng"]);
        assert_eq!(server.received_requests().await.unwrap().len(), 2);
    }

    #[tokio::test]
    async fn a_missing_building_is_not_retried() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        assert!(
            TwinDirectory::new(server.uri())
                .domains_for_building("b1", "claims")
                .await
                .is_err()
        );
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn concurrent_misses_on_one_building_make_a_single_request() {
        let server = server().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(["eng"])
                    .set_delay(Duration::from_millis(300)),
            )
            .mount(&server)
            .await;

        let directory = Arc::new(TwinDirectory::new(server.uri()));
        let lookups: Vec<_> = (0..5)
            .map(|_| {
                let directory = directory.clone();
                tokio::spawn(async move { directory.domains_for_building("b1", "claims").await })
            })
            .collect();

        for lookup in lookups {
            assert_eq!(lookup.await.unwrap().unwrap(), vec!["eng"]);
        }
        assert_eq!(server.received_requests().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn distinct_buildings_are_not_gated_behind_each_other() {
        let server = server().await;
        for building in ["b1", "b2"] {
            Mock::given(method("GET"))
                .and(path(format!("/domain/{building}")))
                .respond_with(
                    ResponseTemplate::new(200)
                        .set_body_json([building])
                        .set_delay(Duration::from_millis(300)),
                )
                .mount(&server)
                .await;
        }

        let directory = Arc::new(TwinDirectory::new(server.uri()));
        let started = Instant::now();
        let first = {
            let directory = directory.clone();
            tokio::spawn(async move { directory.domains_for_building("b1", "claims").await })
        };
        let second = {
            let directory = directory.clone();
            tokio::spawn(async move { directory.domains_for_building("b2", "claims").await })
        };
        first.await.unwrap().unwrap();
        second.await.unwrap().unwrap();

        assert!(
            started.elapsed() < Duration::from_millis(500),
            "two buildings took {:?}, so they queued behind one another",
            started.elapsed()
        );
    }
}
