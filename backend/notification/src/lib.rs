use axum::Router;
use axum::routing::{get, post};

pub mod adapters;
pub mod domain;
pub mod service;
pub mod state;

use state::AppState;

fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(adapters::metrics::health))
        .route("/health/", get(adapters::metrics::health))
        .route("/metrics", get(adapters::metrics::metrics_handler))
        .route("/metrics/", get(adapters::metrics::metrics_handler))
        .route(
            "/public-key",
            get(adapters::driving::http_api::controllers::public_key),
        )
}

fn protected_routes() -> Router<AppState> {
    use adapters::driving::http_api::controllers::*;

    Router::new()
        .route("/subscribe", post(subscribe))
        .route("/preferences", get(get_preferences).post(update_preference))
        .route("/preferences/{account_name}", get(get_preferences))
        .route("/trigger", post(trigger_alert))
        .route("/push/temperature", post(push_temperature_alert))
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
