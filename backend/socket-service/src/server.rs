use axum::Router;
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::routing::get;
use futures::StreamExt;
use socketioxide::SocketIo;
use socketioxide::handler::ConnectHandler;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

use crate::handlers::{authenticate, deliver, on_connect};
use crate::metrics::{self, TELEMETRY_RELAYED_TOTAL, gather};
use crate::relay::{notification_delivery, telemetry_delivery};

pub const PORT: u16 = 3000;
const NOTIFICATIONS_CHANNEL: &str = "notifications";
const TELEMETRY_PATTERN: &str = "telemetry:filtered:*";
const DEFAULT_FRONTEND_URL: &str = "http://localhost:5173";

pub fn redis_url() -> String {
    std::env::var("REDIS_URL").unwrap_or_default()
}

fn frontend_url() -> String {
    std::env::var("FRONTEND_URL").unwrap_or_else(|_| DEFAULT_FRONTEND_URL.to_string())
}

pub async fn serve<F>(listener: TcpListener, redis_url: String, shutdown: F) -> std::io::Result<()>
where
    F: Future<Output = ()> + Send + 'static,
{
    metrics::init();

    let (layer, io) = SocketIo::builder().build_layer();
    io.ns("/", on_connect.with(authenticate));

    tokio::spawn(subscribe_to_redis(io, redis_url));

    let app = Router::new()
        .route("/health", get(async || StatusCode::OK))
        .route("/metrics", get(metrics))
        .layer(layer)
        .layer(cors());

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown)
        .await
}

async fn metrics() -> ([(header::HeaderName, &'static str); 1], String) {
    ([(header::CONTENT_TYPE, prometheus::TEXT_FORMAT)], gather())
}

fn cors() -> CorsLayer {
    let origin = frontend_url()
        .parse::<HeaderValue>()
        .expect("FRONTEND_URL is a valid origin header");

    CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([Method::GET, Method::POST])
        .allow_credentials(true)
}

async fn subscribe_to_redis(io: SocketIo, url: String) {
    let mut pubsub = match connect_pubsub(&url).await {
        Ok(pubsub) => pubsub,
        Err(error) => {
            log::error!("Redis Client Error {error}");
            return;
        }
    };

    let mut messages = pubsub.on_message();
    while let Some(message) = messages.next().await {
        let channel = message.get_channel_name().to_string();
        let Ok(payload) = message.get_payload::<String>() else {
            continue;
        };

        if channel == NOTIFICATIONS_CHANNEL {
            if let Some(delivery) = notification_delivery(&payload) {
                deliver(&io, "notification", delivery).await;
            }
        } else if let Some(delivery) = telemetry_delivery(&channel, &payload) {
            deliver(&io, "telemetry", delivery).await;
            TELEMETRY_RELAYED_TOTAL.inc();
        }
    }
}

async fn connect_pubsub(url: &str) -> redis::RedisResult<redis::aio::PubSub> {
    let mut pubsub = redis::Client::open(url)?.get_async_pubsub().await?;
    pubsub.subscribe(NOTIFICATIONS_CHANNEL).await?;
    pubsub.psubscribe(TELEMETRY_PATTERN).await?;
    Ok(pubsub)
}
