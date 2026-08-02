use env_logger::Env;
use log::{error, info};
use std::env;
use std::net::SocketAddr;
use tokio::net::TcpListener;

use std::sync::Arc;

use twin_service::adapters::driven::kafka_producer::KafkaEventProducer;
use twin_service::adapters::driven::persistence::db::{self, MongoBuildings};
use twin_service::adapters::driven::persistence::jobs::MongoUploadQueue;
use twin_service::adapters::driving::{kafka_consumer, worker};
use twin_service::adapters::{driven::outbound::OutboundConfig, ratelimit::RateLimiter};
use twin_service::build_router;
use twin_service::service::buildings::Buildings;
use twin_service::service::provisioning::Provisioning;
use twin_service::state::AppState;

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
    let buildings = db::connect(&mongo_uri, "crowdvision")
        .await
        .expect("Failed to connect to MongoDB");

    let sync_enabled = env::var("NODE_ENV").map(|v| v != "test").unwrap_or(true);
    let outbound = OutboundConfig {
        sensor_service_url: env::var("SENSOR_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string()),
        contracts_service_url: env::var("CONTRACTS_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:3001".to_string()),
        sync_enabled,
        client: reqwest::Client::new(),
    };

    let kafka_brokers = env::var("KAFKA_BROKERS").unwrap_or_else(|_| "localhost:9092".to_string());
    let events = Arc::new(
        KafkaEventProducer::new(&kafka_brokers)
            .await
            .expect("Failed to configure Kafka producer"),
    );

    let store = Arc::new(MongoBuildings::new(buildings.clone()));
    let queue = Arc::new(MongoUploadQueue::from_building_collection(&buildings));
    let downstream = Arc::new(outbound);

    let provisioning = Arc::new(Provisioning::new(
        store.clone(),
        queue,
        downstream.clone(),
        events,
    ));
    worker::spawn(provisioning.clone());
    kafka_consumer::spawn(&kafka_brokers, provisioning.clone());

    let state = AppState {
        buildings: Arc::new(Buildings::new(store, downstream)),
        provisioning,
        rate_limiter: RateLimiter::new(sync_enabled),
    };

    let app = build_router(state);
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    if let Ok(listener) = TcpListener::bind(format!("0.0.0.0:{port}")).await {
        info!("Twin Service started on port {port}");
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
