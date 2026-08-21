use axum::Router;
use axum::routing::{get, post};

pub mod adapters;
pub mod domain;
pub mod service;
pub mod state;

use state::AppState;

pub const DEFAULT_HISTORY_MAX_MESSAGES: usize = 10;

fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/health", get(adapters::metrics::health))
        .route("/health/", get(adapters::metrics::health))
        .route("/metrics", get(adapters::metrics::metrics_handler))
        .route("/metrics/", get(adapters::metrics::metrics_handler))
}

fn protected_routes() -> Router<AppState> {
    use adapters::driving::http_api::controllers::*;

    Router::new()
        .route(
            "/conversations",
            post(create_conversation).get(list_conversations),
        )
        .route(
            "/conversations/{id}",
            get(get_conversation)
                .patch(rename_conversation)
                .delete(delete_conversation),
        )
        .route("/conversations/{id}/messages", post(send_message))
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
