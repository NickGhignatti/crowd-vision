use crate::state::AppState;
use futures::StreamExt;
use log::{debug, error};
use redis::aio::MultiplexedConnection;
use serde_json::Value;
use tokio::task;

const RAW_CHANNEL: &str = "telemetry:raw";

/// Initializes the telemetry processing tunnel.
pub async fn start_telemetry_tunnel(redis_url: &str, state: AppState) {
    let client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            error!("Failed to create Redis client: {}", e);
            return;
        }
    };

    // Connection for Subscribing
    let pubsub_conn = match client.get_async_pubsub().await {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to get Redis pubsub connection: {}", e);
            return;
        }
    };

    // Connection for Publishing
    let publish_conn = match client.get_multiplexed_async_connection().await {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to get Redis multiplexed connection: {}", e);
            return;
        }
    };

    // Spawn the listening loop in the background
    tokio::spawn(async move {
        listen_and_fanout(pubsub_conn, publish_conn, state).await;
    });
}

async fn listen_and_fanout(
    mut pubsub: redis::aio::PubSub,
    publish_conn: MultiplexedConnection,
    state: AppState,
) {
    if let Err(e) = pubsub.subscribe(RAW_CHANNEL).await {
        error!("Failed to subscribe to {}: {}", RAW_CHANNEL, e);
        return;
    }

    debug!("Subscribed to Redis channel: {}", RAW_CHANNEL);
    let mut stream = pubsub.on_message();

    // Hot loop: Awaits raw telemetry
    while let Some(msg) = stream.next().await {
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(_) => continue,
        };

        let raw_data: Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Clone Arc pointers for the spawn task
        let state_clone = state.clone();
        let pub_conn_clone = publish_conn.clone();

        // Spawn a Tokio task for the fan-out.
        // This ensures the ingestion stream is NEVER blocked by processing time.
        task::spawn(async move {
            process_and_publish(raw_data, state_clone, pub_conn_clone).await;
        });
    }
}

async fn process_and_publish(
    raw_data: Value,
    state: AppState,
    mut publish_conn: MultiplexedConnection,
) {
    // Iterate over all active users in the DashMap
    for entry in state.building_preferences.iter() {
        let building_id = entry.key();
        let allowed_columns = entry.value();

        // Clone the raw data to mutate it for this specific client
        let mut payload = raw_data.clone();

        // Filter out unwanted keys
        if let Value::Object(ref mut map) = payload {
            map.retain(|key, _| allowed_columns.contains(key));
        }

        // Fast serialize and publish
        if let Ok(filtered_str) = serde_json::to_string(&payload) {
            let channel = format!("telemetry:filtered:{}", building_id);

            // Fire and forget using the multiplexed connection
            let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                .arg(&channel)
                .arg(filtered_str)
                .query_async(&mut publish_conn)
                .await;
        }
    }
}
