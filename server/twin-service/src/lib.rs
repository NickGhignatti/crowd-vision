use axum::routing::{get, patch, post, put};
use axum::{Json, Router};

pub mod api;
pub mod infra;
pub mod models;
pub mod state;

use state::AppState;

// GET /contracts
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

// Public infra (no auth): health, Prometheus scrape, metric contract.
// Registered with and without trailing slash -- both k8s (`/health`) and this service's tests (`/health/`) depend on it.
fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(infra::metrics::health))
        .route("/health/", get(infra::metrics::health))
        .route("/metrics", get(infra::metrics::metrics_handler))
        .route("/metrics/", get(infra::metrics::metrics_handler))
        .route("/contracts", get(contracts))
}

// Everything below exposes/mutates building data: every handler requires a
// `GatewayClaims` extractor, which 401s on a missing/invalid x-gateway-claims header.
fn protected_routes() -> Router<AppState> {
    use api::buildings::*;

    Router::new()
        .route("/register", post(add_building))
        .route(
            "/building/{id}",
            get(get_building_by_id).patch(update_building),
        )
        .route("/buildings/counts", post(get_building_counts))
        .route("/buildings/{domain}", get(get_building_by_domain))
        .route("/domain/{building_name}", get(get_domains_by_building))
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
            infra::ratelimit::rate_limit,
        ))
        .layer(axum::middleware::from_fn(infra::metrics::track_metrics))
        .with_state(state)
}
