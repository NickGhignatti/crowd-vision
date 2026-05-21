use axum::{Json, response::IntoResponse};
use log::error;

use crate::discovery::discover_services;
use crate::models::{MetricContract, MetricsDiscoveryResponse};

// GET /metrics
pub async fn get_dashboard_tables() -> impl IntoResponse {
    let services = discover_services();
    let mut possible_metrics: Vec<MetricContract> = Vec::new();

    for service in services {
        let url = format!("{}/contracts", service);
        match reqwest::get(&url).await {
            Ok(res) => match res.json::<MetricsDiscoveryResponse>().await {
                Ok(MetricsDiscoveryResponse::ServiceContract(service_metrics)) => {
                    for mut metric in service_metrics.metrics {
                        if metric.source_service.is_none() {
                            metric.source_service = Some(service_metrics.service.clone());
                        }
                        push_unique_metric(&mut possible_metrics, metric);
                    }
                }
                Ok(MetricsDiscoveryResponse::Metrics(metrics)) => {
                    for mut metric in metrics {
                        if metric.source_service.is_none() {
                            metric.source_service = Some(service.clone());
                        }
                        push_unique_metric(&mut possible_metrics, metric);
                    }
                }
                Err(e) => error!("Failed to deserialize metrics from {url}: {e}"),
            },
            Err(e) => error!("Failed to reach {url}: {e}"),
        }
    }

    Json(serde_json::json!({ "metrics": possible_metrics })).into_response()
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

    /// Creates a fully customisable metric with no fields (sufficient for deduplication tests).
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
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemperatureV1", "svc"));
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemperatureV2", "svc"));
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
        push_unique_metric(&mut metrics, metric_with("people_count", "IPeople", "svc-b"));
        push_unique_metric(&mut metrics, metric_with("air_quality", "IAQ", "svc-c"));
        assert_eq!(metrics.len(), 3);
    }

    #[test]
    fn push_unique_metric_six_entries_with_two_duplicates_yields_four() {
        let mut metrics = Vec::new();
        // Four unique metrics
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemp", "svc-a"));
        push_unique_metric(&mut metrics, metric_with("people_count", "IPeople", "svc-b"));
        push_unique_metric(&mut metrics, metric_with("air_quality", "IAQ", "svc-c"));
        push_unique_metric(&mut metrics, metric_with("humidity", "IHumidity", "svc-d"));
        // Two exact duplicates of already-added entries
        push_unique_metric(&mut metrics, metric_with("temperature", "ITemp", "svc-a"));
        push_unique_metric(&mut metrics, metric_with("people_count", "IPeople", "svc-b"));
        assert_eq!(metrics.len(), 4);
    }
}
