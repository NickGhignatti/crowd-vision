use async_trait::async_trait;

use crate::domain::CLAIMS_HEADER;
use crate::service::ports::DomainDirectory;

pub struct TwinDirectory {
    base_url: String,
    client: reqwest::Client,
}

impl TwinDirectory {
    pub fn new(base_url: String) -> Self {
        TwinDirectory {
            base_url,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl DomainDirectory for TwinDirectory {
    async fn domains_for_building(
        &self,
        building_name: &str,
        claims_header: &str,
    ) -> anyhow::Result<Vec<String>> {
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
        Ok(response.json().await?)
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
