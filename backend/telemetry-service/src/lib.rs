pub mod adapters;
pub mod contracts;
pub mod kernel;
pub mod plugins;
pub mod state;

use adapters::driving::http_api::controllers as c;
use adapters::metrics;
use axum::Router;
use axum::routing::{get, patch, post, put};
use state::AppState;
use std::sync::Arc;

pub fn router(state: Arc<AppState>) -> Router {
    let public = Router::new()
        .route("/health", get(c::health))
        .route("/health/", get(c::health))
        .route("/metrics", get(c::metrics))
        .route("/metrics/", get(c::metrics))
        .route("/contracts", get(c::contracts))
        .route("/contracts/", get(c::contracts))
        .route("/ingest/{sensorType}", post(c::ingest));

    let protected = Router::new()
        .route("/thresholds/buildings/{buildingId}", get(c::building_limits))
        .route(
            "/thresholds/buildings/{buildingId}",
            put(c::register_building),
        )
        .route(
            "/thresholds/{sensorType}/buildings/{buildingId}",
            get(c::building_threshold).patch(c::patch_building_threshold),
        )
        .route(
            "/thresholds/{sensorType}/buildings/{buildingId}/rooms/{roomId}",
            patch(c::patch_room_threshold),
        )
        .route("/sensors/buildings/{buildingId}", get(c::building_sensors))
        .route(
            "/sensors/buildings/{buildingId}/rooms/{roomId}",
            get(c::room_sensors),
        )
        .route("/sensor", post(c::register_sensor))
        .route("/executeAction", post(c::execute_action))
        .route("/{sensorType}/latest", get(c::latest))
        .route("/{sensorType}/entireBuilding", get(c::entire_building))
        .route("/{sensorType}/dashboard", get(c::dashboard));

    public
        .merge(protected)
        .with_state(state)
        .layer(axum::middleware::from_fn(metrics::track_metrics))
}
