use env_logger::Env;
use log::{error, info};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;

use notification::adapters::driven::persistence::db;
use notification::adapters::driven::persistence::preferences::MongoPreferences;
use notification::adapters::driven::persistence::subscriptions::MongoSubscriptions;
use notification::adapters::driven::push::WebPushSender;
use notification::adapters::driven::redis_bus::RedisBus;
use notification::adapters::driven::twin::TwinDirectory;
use notification::adapters::driving::alert_listener;
use notification::adapters::ratelimit::RateLimiter;
use notification::build_router;
use notification::service::alerts::Alerts;
use notification::service::ports::SystemClock;
use notification::service::preferences::Preferences;
use notification::service::push::Push;
use notification::state::AppState;

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

    let mongo_uri = env::var("MONGO_URI")
        .unwrap_or_else(|_| "mongodb://localhost:27017/notificationdb".to_string());
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());
    let twin_url =
        env::var("DIGITAL_TWIN_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let brokers = env::var("KAFKA_BROKERS").unwrap_or_else(|_| "kafka:9092".to_string());
    let vapid_public_key = env::var("VAPID_PUBLIC_KEY").unwrap_or_default();
    let vapid_private_key = env::var("VAPID_PRIVATE_KEY").unwrap_or_default();

    let database = db::connect(&mongo_uri)
        .await
        .expect("Failed to connect to MongoDB");
    let bus = Arc::new(
        RedisBus::connect(&redis_url)
            .await
            .expect("Failed to connect to Redis"),
    );

    let subscriptions = Arc::new(MongoSubscriptions::new(&database));
    let stored_preferences = Arc::new(MongoPreferences::new(&database));
    let sender = Arc::new(WebPushSender::new(&vapid_public_key, &vapid_private_key));

    let push = Arc::new(Push::new(
        subscriptions.clone(),
        stored_preferences.clone(),
        sender,
    ));
    let preferences = Arc::new(Preferences::new(subscriptions, stored_preferences));
    let alerts = Arc::new(Alerts::new(
        bus.clone(),
        bus,
        Arc::new(TwinDirectory::new(twin_url)),
        push,
        Arc::new(SystemClock),
    ));

    let listener_alerts = alerts.clone();
    tokio::spawn(async move {
        if let Err(e) = alert_listener::listen(&brokers, listener_alerts).await {
            error!("[Event] Temperature alert listener stopped: {e:?}");
        }
    });

    let state = AppState {
        alerts,
        preferences,
        vapid_public_key,
        rate_limiter: RateLimiter::new(env::var("NODE_ENV").map(|v| v != "test").unwrap_or(true)),
    };

    let app = build_router(state);
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{port}")).await {
        info!("Notification Service started on port {port}");
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
