use axum::routing::{get, patch, post, put};
use axum::{Json, Router};

pub mod adapters;
pub mod domain;
pub mod service;
pub mod state;

use state::AppState;

async fn contracts() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "digital-twin-service",
        "metrics": [
            {
                "metricKey": "roomName",
                "label": "Room Name",
                "interfaceName": "IRoomName",
                "unit": "string",
                "fields": [
                    { "name": "buildingId", "type": "string", "required": true },
                    { "name": "roomId", "type": "string", "required": true },
                    { "name": "name", "type": "string", "required": true }
                ]
            },
            {
                "metricKey": "roomMaxOccupancy",
                "label": "Room Max Occupancy",
                "interfaceName": "IRoomMaxOccupancy",
                "unit": "people",
                "fields": [
                    { "name": "buildingId", "type": "string", "required": true },
                    { "name": "roomId", "type": "string", "required": true },
                    { "name": "maxOccupancy", "type": "integer", "required": true }
                ]
            }
        ]
    }))
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
