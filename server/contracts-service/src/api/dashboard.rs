use axum::{Json, response::IntoResponse};
use futures::future::join_all;
use log::error;
use std::time::Duration;

use crate::infra::claims::GatewayClaims;
use crate::infra::discovery::discover_services;
use crate::models::{MetricContract, MetricsDiscoveryResponse};

// GET /metrics
pub async fn get_dashboard_tables(_claims: GatewayClaims) -> impl IntoResponse {
    let metrics = collect_metrics(discover_services()).await;
    Json(serde_json::json!({ "metrics": metrics })).into_response()
}

/// Fetches and normalises one service's `/contracts`. Returns an empty Vec on
/// any error (unreachable, timeout, unparseable) — one bad service is skipped.
async fn fetch_service_metrics(client: &reqwest::Client, service: &str) -> Vec<MetricContract> {
    let url = format!("{service}/contracts");
    let res = match client.get(&url).send().await {
        Ok(res) => res,
        Err(e) => {
            error!("Failed to reach {url}: {e}");
            return Vec::new();
        }
    };
    match res.json::<MetricsDiscoveryResponse>().await {
        Ok(MetricsDiscoveryResponse::ServiceContract(sc)) => sc
            .metrics
            .into_iter()
            .map(|mut m| {
                if m.source_service.is_none() {
                    m.source_service = Some(sc.service.clone());
                }
                m
            })
            .collect(),
        Ok(MetricsDiscoveryResponse::Metrics(metrics)) => metrics
            .into_iter()
            .map(|mut m| {
                if m.source_service.is_none() {
                    m.source_service = Some(service.to_string());
                }
                m
            })
            .collect(),
        Err(e) => {
            error!("Failed to deserialize metrics from {url}: {e}");
            Vec::new()
        }
    }
}

async fn collect_metrics(services: Vec<String>) -> Vec<MetricContract> {
    // One client for all services: shared connection pool + a hard per-request
    // timeout so a hung service can't stall the dashboard.
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to build HTTP client: {e}");
            return Vec::new();
        }
    };

    // Fan out: total latency ≈ slowest service.
    let fetches = services.into_iter().map(|service| {
        let client = client.clone(); // cheap: Arc clone, shares the pool
        async move { fetch_service_metrics(&client, &service).await }
    });
    let per_service: Vec<Vec<MetricContract>> = join_all(fetches).await;

    // Merge + dedup sequentially — dedup is inherently order-dependent.
    let mut possible_metrics: Vec<MetricContract> = Vec::new();
    for metrics in per_service {
        for metric in metrics {
            push_unique_metric(&mut possible_metrics, metric);
        }
    }
    possible_metrics
}

fn push_unique_metric(possible_metrics: &mut Vec<MetricContract>, metric: MetricContract) {
    if possible_metrics.iter().any(|existing| {
        existing.metric_key == metric.metric_key
            && existing.interface_name == metric.interface_name
            && existing.source_service == metric.source_service
    }) {
        return;
    }

    possible_metrics.push(metric);
}

#[cfg(test)]
mod tests {
    use super::push_unique_metric;
    use crate::models::MetricContract;

    /// Creates a metric with a fixed metric_key and interface_name, varying only source_service.
    fn metric(source_service: &str) -> MetricContract {
        metric_with("temperature", "ITemperature", source_service)
    }

    /// Creates a fully customisable metric with no fields.
    fn metric_with(metric_key: &str, interface_name: &str, source_service: &str) -> MetricContract {
        MetricContract {
            metric_key: metric_key.to_string(),
            label: format!("Label {}", metric_key),
            interface_name: interface_name.to_string(),
            unit: None,
            fields: vec![],
            source_service: Some(source_service.to_string()),
        }
    }

    // ── Deduplication ─────────────────────────────────────────────────────────

    #[test]
    fn push_unique_metric_adds_first_entry_to_empty_vec() {
        let mut metrics = Vec::new();
        push_unique_metric(&mut metrics, metric("sensor-service"));
        assert_eq!(metrics.len(), 1);
    }

    #[test]
    fn push_unique_metric_ignores_exact_duplicates() {
        let mut possible_metrics = Vec::new();
        let m = metric("sensor-service");

        push_unique_metric(&mut possible_metrics, m.clone());
        push_unique_metric(&mut possible_metrics, m);

        assert_eq!(possible_metrics.len(), 1);
    }

    #[test]
    fn push_unique_metric_keeps_same_metric_key_with_different_interface_name() {
        // Same metric_key but different interface_name → not a duplicate.
        let mut metrics = Vec::new();
        push_unique_metric(
            &mut metrics,
            metric_with("temperature", "ITemperatureV1", "svc"),
        );
        push_unique_metric(
            &mut metrics,
            metric_with("temperature", "ITemperatureV2", "svc"),
        );
        assert_eq!(metrics.len(), 2);
    }

    #[test]
    fn push_unique_metric_keeps_same_metric_from_different_services() {
        // Same metric_key + interface_name but different source_service → not a duplicate.
        let mut possible_metrics = Vec::new();

        push_unique_metric(&mut possible_metrics, metric("sensor-service"));
        push_unique_metric(&mut possible_metrics, metric("air-service"));

        assert_eq!(possible_metrics.len(), 2);
    }

    #[test]
    fn push_unique_metric_retains_three_fully_distinct_metrics() {
        let mut metrics = Vec::new();
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemp", "svc-a"));
        push_unique_metric(
            &mut metrics,
            metric_with("people_count", "IPeople", "svc-b"),
        );
        push_unique_metric(&mut metrics, metric_with("air_quality", "IAQ", "svc-c"));
        assert_eq!(metrics.len(), 3);
    }

    #[test]
    fn push_unique_metric_six_entries_with_two_duplicates_yields_four() {
        let mut metrics = Vec::new();
        // Four unique metrics
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemp", "svc-a"));
        push_unique_metric(
            &mut metrics,
            metric_with("people_count", "IPeople", "svc-b"),
        );
        push_unique_metric(&mut metrics, metric_with("air_quality", "IAQ", "svc-c"));
        push_unique_metric(&mut metrics, metric_with("humidity", "IHumidity", "svc-d"));
        // Two exact duplicates of already-added entries
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemp", "svc-a"));
        push_unique_metric(
            &mut metrics,
            metric_with("people_count", "IPeople", "svc-b"),
        );
        assert_eq!(metrics.len(), 4);
    }

    // ── collect_metrics (HTTP fan-out, mocked with wiremock) ──────────────────

    use super::collect_metrics;
    use serde_json::json;
    use std::time::Duration;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Mounts a `GET /contracts` response on a fresh mock server and returns it.
    async fn mock_contracts(body: serde_json::Value) -> MockServer {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/contracts"))
            .respond_with(ResponseTemplate::new(200).set_body_json(body))
            .mount(&server)
            .await;
        server
    }

    #[tokio::test]
    async fn collects_bare_array_response_and_backfills_source_from_url() {
        // The `Metrics` variant: a bare array with no service name. source_service
        // must be back-filled from the service URL it was fetched from.
        let server = mock_contracts(json!([{
            "metricKey": "temperature",
            "label": "Temperature",
            "interfaceName": "ITemperature",
            "fields": []
        }]))
        .await;

        let metrics = collect_metrics(vec![server.uri()]).await;

        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].metric_key, "temperature");
        assert_eq!(
            metrics[0].source_service.as_deref(),
            Some(server.uri().as_str())
        );
    }

    #[tokio::test]
    async fn collects_service_contract_response_and_backfills_source_from_service_name() {
        // The `ServiceContract` variant carries its own service name, which is
        // used as source_service rather than the URL.
        let server = mock_contracts(json!({
            "service": "sensor-service",
            "metrics": [{
                "metricKey": "co2",
                "label": "CO2",
                "interfaceName": "IAirQuality",
                "fields": []
            }]
        }))
        .await;

        let metrics = collect_metrics(vec![server.uri()]).await;

        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].source_service.as_deref(), Some("sensor-service"));
    }

    #[tokio::test]
    async fn dedupes_identical_metrics_returned_by_one_service() {
        let server = mock_contracts(json!({
            "service": "sensor-service",
            "metrics": [
                { "metricKey": "temperature", "label": "T", "interfaceName": "ITemperature", "fields": [] },
                { "metricKey": "temperature", "label": "T", "interfaceName": "ITemperature", "fields": [] }
            ]
        }))
        .await;

        let metrics = collect_metrics(vec![server.uri()]).await;

        assert_eq!(metrics.len(), 1);
    }

    #[tokio::test]
    async fn skips_service_returning_unparseable_body() {
        // No matcher mounted → wiremock answers 404 with a body that is not a
        // MetricsDiscoveryResponse, exercising the deserialize-error arm.
        let server = MockServer::start().await;
        let metrics = collect_metrics(vec![server.uri()]).await;
        assert!(metrics.is_empty());
    }

    #[tokio::test]
    async fn keeps_reachable_service_when_another_is_unreachable() {
        let server = mock_contracts(json!([{
            "metricKey": "temperature",
            "label": "Temperature",
            "interfaceName": "ITemperature",
            "fields": []
        }]))
        .await;

        // Port 1 has nothing listening → reqwest returns an error, exercising the
        // unreachable arm; the good service must still come through.
        let metrics = collect_metrics(vec!["http://127.0.0.1:1".to_string(), server.uri()]).await;

        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].metric_key, "temperature");
    }

    #[tokio::test]
    async fn skips_service_that_exceeds_timeout() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/contracts"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_delay(Duration::from_secs(5))
                    .set_body_json(json!([])),
            )
            .mount(&server)
            .await;

        let metrics = collect_metrics(vec![server.uri()]).await;
        assert!(metrics.is_empty()); // timed out → skipped
    }
}
