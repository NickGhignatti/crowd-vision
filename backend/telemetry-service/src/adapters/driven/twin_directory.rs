use crate::kernel::ports::BuildingDirectory;
use async_trait::async_trait;
use dashmap::DashMap;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(60);

pub struct TwinDirectory {
    base_url: String,
    client: reqwest::Client,
    cache: DashMap<String, (Instant, Vec<String>)>,
}

impl TwinDirectory {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::new(),
            cache: DashMap::new(),
        }
    }

    fn cached(&self, building_id: &str) -> Option<Vec<String>> {
        let entry = self.cache.get(building_id)?;
        let (stored_at, domains) = entry.value();
        (stored_at.elapsed() < TTL).then(|| domains.clone())
    }
}

#[async_trait]
impl BuildingDirectory for TwinDirectory {
    async fn domains_of(&self, building_id: &str, claims: &str) -> anyhow::Result<Vec<String>> {
        if let Some(domains) = self.cached(building_id) {
            return Ok(domains);
        }

        let url = format!(
            "{}/domain/{}",
            self.base_url,
            urlencoding::encode(building_id)
        );
        let response = self
            .client
            .get(&url)
            .header(crate::contracts::identity::CLAIMS_HEADER, claims)
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!(
                "twin-service returned {} for {building_id}",
                response.status()
            );
        }

        let domains: Vec<String> = response.json().await?;
        self.cache
            .insert(building_id.to_owned(), (Instant::now(), domains.clone()));
        Ok(domains)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn domains_are_read_from_twin_service() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .and(header("x-gateway-claims", "raw-claims"))
            .respond_with(ResponseTemplate::new(200).set_body_json(vec!["eng", "ops"]))
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());
        let domains = directory.domains_of("b1", "raw-claims").await.unwrap();
        assert_eq!(domains, vec!["eng".to_owned(), "ops".to_owned()]);
    }

    #[tokio::test]
    async fn a_second_lookup_is_served_from_the_cache() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(200).set_body_json(vec!["eng"]))
            .expect(1)
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());
        directory.domains_of("b1", "raw").await.unwrap();
        directory.domains_of("b1", "raw").await.unwrap();
    }

    #[tokio::test]
    async fn a_failed_lookup_is_an_error_and_is_not_cached() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/domain/b1"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let directory = TwinDirectory::new(server.uri());
        assert!(directory.domains_of("b1", "raw").await.is_err());
        assert!(directory.cached("b1").is_none());
    }
}
