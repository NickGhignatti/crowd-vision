use axum::{
    Router,
    routing::{get, post},
};
use env_logger::Env;
use log::{error, info};
use std::env;
use tokio::net::TcpListener;

mod api;
mod discovery;
mod models;
mod state;
mod tunnel;

use state::AppState;

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();
    let state = AppState::new();
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());

    // Start the background telemetry tunnel
    tunnel::start_telemetry_tunnel(&redis_url, state.clone()).await;

    let app = Router::new()
        .route("/", get(api::dashboard::get_dashboard_tables))
        .route("/preferences/{building_id}", get(api::data::get_preferences).post(api::data::update_preferences))
        .route("/preferences/init/{building_id}", post(api::init::init_building_preferences))
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{port}")).await {
        info!("Contracts Service started on port {port}");
        if let Err(e) = axum::serve(listener, app).await {
            error!("Failed to serve: {e}");
        }
    } else {
        error!("Failed to bind to port {port}");
    }
}
