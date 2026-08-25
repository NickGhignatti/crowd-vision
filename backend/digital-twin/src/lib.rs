use axum::routing::{get, patch, post, put};
use axum::{Json, Router};

pub mod adapters;
pub mod domain;
pub mod service;
pub mod state;

use state::AppState;
use telemetry_schema::{MetricContract, MetricFieldContract, ServiceMetricsContract};

/// The dashboard's column catalog. Built from `telemetry_schema`, the same types
/// telemetry's `/contracts` serves and the dashboard parses - a hand-rolled `json!`
/// here is how `key`/`metricKey` once drifted and emptied the catalog at runtime.
async fn contracts() -> Json<ServiceMetricsContract> {
    fn field(name: &str, field_type: &str) -> MetricFieldContract {
        MetricFieldContract {
            name: name.to_owned(),
            field_type: field_type.to_owned(),
            required: true,
            description: None,
        }
    }

    Json(ServiceMetricsContract {
        service: "digital-twin".to_owned(),
        metrics: vec![
            MetricContract {
                metric_key: "roomName".to_owned(),
                label: "Room Name".to_owned(),
                interface_name: "IRoomName".to_owned(),
                unit: Some("string".to_owned()),
                fields: vec![
                    field("buildingId", "string"),
                    field("roomId", "string"),
                    field("name", "string"),
                ],
                actions: vec![],
                source_service: None,
            },
            MetricContract {
                metric_key: "roomMaxOccupancy".to_owned(),
                label: "Room Max Occupancy".to_owned(),
                interface_name: "IRoomMaxOccupancy".to_owned(),
                unit: Some("people".to_owned()),
                fields: vec![
                    field("buildingId", "string"),
                    field("roomId", "string"),
                    field("maxOccupancy", "integer"),
                ],
                actions: vec![],
                source_service: None,
            },
        ],
    })
}

fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(adapters::metrics::health))
        .route("/health/", get(adapters::metrics::health))
        .route("/metrics", get(adapters::metrics::metrics_handler))
        .route("/metrics/", get(adapters::metrics::metrics_handler))
        .route("/contracts", get(contracts))
}

fn protected_routes() -> Router<AppState> {
    use adapters::driving::http_api::controllers::*;

    Router::new()
        .route("/register", post(add_building))
        .route(
            "/building/{id}",
            get(get_building_by_id).patch(update_building),
        )
        .route("/building/{id}/status", get(get_upload_status))
        .route("/building/{id}/sync", post(resync_building))
        .route("/buildings/counts", post(get_building_counts))
        .route("/buildings/{domain}", get(get_building_by_domain))
        .route("/domain/{building}", get(get_domains_by_building))
        .route(
            "/building/{id}/room/{room_id}",
            patch(update_room).delete(delete_room),
        )
        .route("/building/{id}/room", post(create_room))
        .route("/building/{id}/rooms", put(replace_rooms))
}

pub fn build_router(state: AppState) -> Router {
    let rate_limiter = state.rate_limiter.clone();
    public_routes()
        .merge(protected_routes())
        .layer(axum::middleware::from_fn_with_state(
            rate_limiter,
            adapters::ratelimit::rate_limit,
        ))
        .layer(axum::middleware::from_fn(adapters::metrics::track_metrics))
        .with_state(state)
}

#[cfg(test)]
mod contracts_tests {
    use super::contracts;

    /// The dashboard parses this with `telemetry_schema::MetricsDiscoveryResponse`, so the
    /// wire names here are the shared contract's, not this service's own spelling.
    #[tokio::test]
    async fn the_catalog_is_served_under_the_services_real_name() {
        let body = serde_json::to_value(contracts().await.0).unwrap();
        assert_eq!(body["service"], "digital-twin");
    }

    #[tokio::test]
    async fn every_metric_carries_the_camel_case_names_the_dashboard_reads() {
        let body = serde_json::to_value(contracts().await.0).unwrap();
        let metrics = body["metrics"].as_array().unwrap();

        let keys: Vec<&str> = metrics
            .iter()
            .map(|m| m["metricKey"].as_str().unwrap())
            .collect();
        assert_eq!(keys, vec!["roomName", "roomMaxOccupancy"]);

        for metric in metrics {
            assert!(
                metric["interfaceName"].is_string(),
                "interfaceName missing: {metric}"
            );
            assert!(
                metric["fields"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .all(|f| f["type"].is_string())
            );
        }
    }

    #[tokio::test]
    async fn the_catalog_round_trips_through_the_shared_contract() {
        let encoded = serde_json::to_value(contracts().await.0).unwrap();
        let decoded: telemetry_schema::MetricsDiscoveryResponse =
            serde_json::from_value(encoded).expect("dashboard's parser accepts this body");
        assert!(matches!(
            decoded,
            telemetry_schema::MetricsDiscoveryResponse::ServiceContract(_)
        ));
    }
}
