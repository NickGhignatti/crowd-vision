use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::core::auth::CLAIMS_HEADER;

const TTL: Duration = Duration::from_secs(60);
const TIMEOUT: Duration = Duration::from_secs(2);

pub struct BuildingDomains {
    base_url: String,
    client: reqwest::Client,
    cache: Mutex<HashMap<String, (Instant, Vec<String>)>>,
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
        }
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

        let response = self
            .client
            .get(self.url(building_id)?)
            .header(CLAIMS_HEADER, claims)
            .send()
            .await
            .inspect_err(|error| log::warn!("twin-service unreachable for {building_id}: {error}"))
            .ok()?;

        if !response.status().is_success() {
            log::warn!(
                "twin-service answered {} for {building_id}",
                response.status()
            );
            return None;
        }

        let domains: Vec<String> = response
            .json()
            .await
            .inspect_err(|error| log::warn!("twin-service sent no domain list: {error}"))
            .ok()?;

        self.remember(building_id, &domains);
        Some(domains)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn directory() -> BuildingDomains {
        BuildingDomains::new("http://twin-service:3000".to_string())
    }

    #[test]
    fn the_lookup_url_is_the_domain_route_of_the_building() {
        assert_eq!(
            directory().url("b1").unwrap().as_str(),
            "http://twin-service:3000/domain/b1"
        );
    }

    #[test]
    fn a_building_id_with_a_slash_cannot_escape_the_domain_route() {
        assert_eq!(
            directory().url("../buildings").unwrap().as_str(),
            "http://twin-service:3000/domain/..%2Fbuildings"
        );
    }

    #[test]
    fn a_building_id_keeps_the_colons_that_belong_to_it() {
        assert_eq!(
            directory().url("site:b1").unwrap().as_str(),
            "http://twin-service:3000/domain/site:b1"
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
}
