use env_logger::Env;
use log::{error, info};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

use chat::adapters::driven::agent::AgentService;
use chat::adapters::driven::persistence::conversations::MongoConversations;
use chat::adapters::driven::persistence::db;
use chat::adapters::ratelimit::RateLimiter;
use chat::service::conversations::Conversations;
use chat::state::AppState;
use chat::{DEFAULT_HISTORY_MAX_MESSAGES, build_router};

/// Node re-read and re-validated this per request, so a bad value only surfaced as a
/// 500 on the first message. Reading it once at boot turns the same mistake into a
/// container that refuses to start.
fn history_max_messages() -> usize {
    match env::var("HISTORY_MAX_MESSAGES") {
        Err(_) => DEFAULT_HISTORY_MAX_MESSAGES,
        Ok(raw) => raw
            .parse::<usize>()
            .ok()
            .filter(|value| *value >= 1)
            .unwrap_or_else(|| panic!("HISTORY_MAX_MESSAGES must be a positive integer")),
    }
}

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
        env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017/chatdb".to_string());
    let agent_url = env::var("AGENT_URL").unwrap_or_else(|_| "http://agent:3000".to_string());

    let database = db::connect(&mongo_uri)
        .await
        .expect("Failed to connect to MongoDB");

    let conversations = Arc::new(Conversations::new(
        Arc::new(MongoConversations::new(&database)),
        Arc::new(AgentService::new(agent_url)),
        history_max_messages(),
    ));

    let state = AppState {
        conversations,
        rate_limiter: RateLimiter::new(env::var("NODE_ENV").map(|v| v != "test").unwrap_or(true)),
    };

    let app = build_router(state);
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{port}")).await {
        info!("Chat Service started on port {port}");
        if let Err(e) = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(shutdown_signal())
        .await
        {
            error!("Failed to serve: {e}");
        }
    } else {
        error!("Failed to bind to port {port}");
    }
}
