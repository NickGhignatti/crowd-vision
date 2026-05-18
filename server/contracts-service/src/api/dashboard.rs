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
    use crate::models::{MetricContract, MetricFieldContract};

    fn metric(source_service: &str) -> MetricContract {
        MetricContract {
            metric_key: "temperature".to_string(),
            label: "Temperature".to_string(),
            interface_name: "ITemperature".to_string(),
            unit: Some("C".to_string()),
            fields: vec![
                MetricFieldContract {
                    name: "building".to_string(),
                    field_type: "string".to_string(),
                    required: true,
                    description: None,
                },
                MetricFieldContract {
                    name: "temperature".to_string(),
                    field_type: "number".to_string(),
                    required: true,
                    description: None,
                },
            ],
            source_service: Some(source_service.to_string()),
        }
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
    fn push_unique_metric_keeps_same_metric_from_different_services() {
        let mut possible_metrics = Vec::new();

        push_unique_metric(&mut possible_metrics, metric("sensor-service"));
        push_unique_metric(&mut possible_metrics, metric("air-service"));

        assert_eq!(possible_metrics.len(), 2);
    }
}
