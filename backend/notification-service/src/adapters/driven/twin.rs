use async_trait::async_trait;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::domain::CLAIMS_HEADER;
use crate::service::ports::DomainDirectory;

const TIMEOUT: Duration = Duration::from_secs(2);
const TTL: Duration = Duration::from_secs(15 * 60);

pub struct TwinDirectory {
    base_url: String,
    client: reqwest::Client,
    cache: Mutex<HashMap<String, (Instant, Vec<String>)>>,
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
        }
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

        let url = format!(
            "{}/domain/{}",
            self.base_url,
            urlencoding::encode(building_name)
        );
        let response = self
            .client
            .get(url)
            .header(CLAIMS_HEADER, claims_header)
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!("Twin lookup failed for building {building_name}");
        }
        let domains: Vec<String> = response.json().await?;
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
            .expect(2)
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
}
