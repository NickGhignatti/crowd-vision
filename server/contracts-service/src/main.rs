use axum::{
    Router,
    routing::{get, post},
};
use env_logger::Env;
use log::{error, info};
use std::env;
use tokio::net::TcpListener;

mod api;
mod infra;
mod models;
mod state;
mod tunnel;

use state::AppState;

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let mongo_uri =
        env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());

    let col = infra::db::connect(&mongo_uri)
        .await
        .expect("Failed to connect to MongoDB");

    // One-time read at startup: seed the in-memory map from persistent storage.
    // All subsequent reads are served from the DashMap without touching MongoDB.
    let state = AppState::new(col.clone());
    for doc in infra::db::load_all(&col)
        .await
        .expect("Failed to load preferences from MongoDB")
    {
        state
            .building_preferences
            .insert(doc.building_id, doc.allowed_columns);
    }

    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());

    // Start the background telemetry tunnel
    tunnel::start_telemetry_tunnel(&redis_url, state.clone()).await;

    let app = Router::new()
        .route("/health", get(infra::metrics::health))
        .route("/", get(api::dashboard::get_dashboard_tables))
        .route(
            "/preferences/{building_id}",
            get(api::data::get_preferences).post(api::data::update_preferences),
        )
        .route(
            "/preferences/init/{building_id}",
            post(api::init::init_building_preferences),
        )
        .route("/metrics", get(infra::metrics::metrics_handler))
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{port}")).await {
        info!("Contracts Service started on port {port}");
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(shutdown_signal())
            .await
        {
            error!("Failed to serve: {e}");
        }
    } else {
        error!("Failed to bind to port {port}");
    }
}
