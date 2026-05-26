use crate::state::AppState;
use futures::StreamExt;
use log::info;
use redis::aio::MultiplexedConnection;
use serde_json::Value;
use tokio::task;

const RAW_CHANNEL: &str = "telemetry:raw";

/// Returns the `type` field of a telemetry JSON payload if it is present and a string.
fn extract_metric_type(raw: &Value) -> Option<&str> {
    raw.get("type").and_then(|v| v.as_str())
}

/// Returns true if `metric_type` appears in the building's list of allowed columns.
fn metric_is_allowed(allowed_columns: &[String], metric_type: &str) -> bool {
    allowed_columns.iter().any(|col| col == metric_type)
}

/// Initializes the telemetry processing tunnel.
pub async fn start_telemetry_tunnel(redis_url: &str, state: AppState) {
    let client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            info!("Failed to create Redis client: {}", e);
            return;
        }
    };

    // Connection for Subscribing
    let pubsub_conn = match client.get_async_pubsub().await {
        Ok(conn) => conn,
        Err(e) => {
            info!("Failed to get Redis pubsub connection: {}", e);
            return;
        }
    };

    // Connection for Publishing
    let publish_conn = match client.get_multiplexed_async_connection().await {
        Ok(conn) => conn,
        Err(e) => {
            info!("Failed to get Redis multiplexed connection: {}", e);
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
        info!("Failed to subscribe to {}: {}", RAW_CHANNEL, e);
        return;
    }

    info!("Subscribed to Redis channel: {}", RAW_CHANNEL);
    let mut stream = pubsub.on_message();

    // Hot loop: Awaits raw telemetry
    while let Some(msg) = stream.next().await {
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(_) => {
                info!("FAIL");
                continue;
            }
        };

        info!("Received raw telemetry: {}", payload.clone());

        let raw_data: Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(_) => {
                info!("FAIL");
                continue;
            }
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
    let metric_type = match extract_metric_type(&raw_data) {
        Some(t) => t,
        None => {
            info!("Raw telemetry missing 'type' field, skipping");
            return;
        }
    };

    for entry in state.building_preferences.iter() {
        let building_id = entry.key();
        let allowed_columns = entry.value();

        if !metric_is_allowed(allowed_columns, metric_type) {
            continue;
        }

        if let Ok(payload_str) = serde_json::to_string(&raw_data) {
            info!(
                "Publishing to channel telemetry:filtered:{}: {}",
                building_id, payload_str
            );
            let channel = format!("telemetry:filtered:{}", building_id);
            let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                .arg(&channel)
                .arg(payload_str)
                .query_async(&mut publish_conn)
                .await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_metric_type, metric_is_allowed};
    use serde_json::json;

    // ── metric_is_allowed ─────────────────────────────────────────────────────

    #[test]
    fn allowed_when_type_matches_a_column() {
        let cols = vec!["temperature".to_string()];
        assert!(metric_is_allowed(&cols, "temperature"));
    }

    #[test]
    fn not_allowed_when_type_absent_from_columns() {
        let cols = vec!["temperature".to_string()];
        assert!(!metric_is_allowed(&cols, "air_quality"));
    }

    #[test]
    fn not_allowed_when_column_list_is_empty() {
        assert!(!metric_is_allowed(&[], "temperature"));
    }

    #[test]
    fn allowed_when_type_is_one_of_multiple_columns() {
        let cols = vec!["temperature".to_string(), "people_count".to_string()];
        assert!(metric_is_allowed(&cols, "people_count"));
    }

    // ── extract_metric_type ───────────────────────────────────────────────────

    #[test]
    fn extracts_string_type_field() {
        let raw = json!({ "type": "temperature", "value": 22 });
        assert_eq!(extract_metric_type(&raw), Some("temperature"));
    }

    #[test]
    fn returns_none_when_type_field_missing() {
        let raw = json!({ "value": 22 });
        assert_eq!(extract_metric_type(&raw), None);
    }

    #[test]
    fn returns_none_when_type_field_is_not_a_string() {
        let raw = json!({ "type": 42 });
        assert_eq!(extract_metric_type(&raw), None);
    }

    #[test]
    fn returns_none_for_empty_json_object() {
        let raw = json!({});
        assert_eq!(extract_metric_type(&raw), None);
    }
}
