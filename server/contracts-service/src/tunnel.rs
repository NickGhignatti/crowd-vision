use crate::state::AppState;
use dashmap::DashMap;
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
    let mut stream = pubsub.on_message();

    // Hot loop: Awaits raw telemetry
    while let Some(msg) = stream.next().await {
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(_) => {
                continue;
            }
        };

        let raw_data: Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(_) => {
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

fn extract_building_id(raw: &Value) -> Option<&str> {
    raw.get("buildingId").and_then(|v| v.as_str())
}

/// Decides which `telemetry:filtered:*` channel a raw event must be forwarded
/// to, or `None` if it should be dropped. Routing is keyed on the event's OWN
/// `buildingId`, so an event is delivered to exactly one building — never
/// fanned out to every subscriber. Pure (logging aside): no Redis connection,
/// so every branch is unit-testable.
fn resolve_channel(
    raw: &Value,
    building_preferences: &DashMap<String, Vec<String>>,
) -> Option<String> {
    let metric_type = match extract_metric_type(raw) {
        Some(t) => t,
        None => {
            info!("Raw telemetry missing 'type' field, skipping");
            return None;
        }
    };

    let building_id = match extract_building_id(raw) {
        Some(id) => id,
        None => {
            info!("Raw telemetry missing 'buildingId' field, skipping");
            return None;
        }
    };

    let Some(allowed_columns) = building_preferences.get(building_id) else {
        info!(
            "No preferences found for building {}, skipping",
            building_id
        );
        return None;
    };

    if !metric_is_allowed(&allowed_columns, metric_type) {
        return None;
    }

    Some(format!("telemetry:filtered:{}", building_id))
}

async fn process_and_publish(
    raw_data: Value,
    state: AppState,
    mut publish_conn: MultiplexedConnection,
) {
    let Some(channel) = resolve_channel(&raw_data, &state.building_preferences) else {
        return;
    };

    let Ok(payload_str) = serde_json::to_string(&raw_data) else {
        return;
    };
    let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
        .arg(&channel)
        .arg(payload_str)
        .query_async(&mut publish_conn)
        .await;
}

#[cfg(test)]
mod tests {
    use super::{extract_building_id, extract_metric_type, metric_is_allowed, resolve_channel};
    use dashmap::DashMap;
    use serde_json::json;

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

    #[test]
    fn extracts_string_building_id_field() {
        let raw = json!({ "type": "temperature", "buildingId": "bldg-1", "value": 22 });
        assert_eq!(extract_building_id(&raw), Some("bldg-1"));
    }

    #[test]
    fn returns_none_when_building_id_field_missing() {
        let raw = json!({ "type": "temperature", "value": 22 });
        assert_eq!(extract_building_id(&raw), None);
    }

    #[test]
    fn returns_none_when_building_id_field_is_not_a_string() {
        let raw = json!({ "type": "temperature", "buildingId": 42 });
        assert_eq!(extract_building_id(&raw), None);
    }

    fn prefs(entries: &[(&str, &[&str])]) -> DashMap<String, Vec<String>> {
        let map = DashMap::new();
        for (building, cols) in entries {
            map.insert(
                building.to_string(),
                cols.iter().map(|c| c.to_string()).collect(),
            );
        }
        map
    }

    #[test]
    fn routes_allowed_metric_to_its_own_building_channel() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        let raw = json!({ "type": "temperature", "buildingId": "bldg-1", "value": 22 });
        assert_eq!(
            resolve_channel(&raw, &map),
            Some("telemetry:filtered:bldg-1".to_string())
        );
    }

    #[test]
    fn drops_metric_not_in_buildings_allowed_columns() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        let raw = json!({ "type": "air_quality", "buildingId": "bldg-1", "value": 5 });
        assert_eq!(resolve_channel(&raw, &map), None);
    }

    #[test]
    fn drops_event_for_building_with_no_preferences() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        // Event belongs to a building that never registered preferences.
        let raw = json!({ "type": "temperature", "buildingId": "bldg-unknown", "value": 22 });
        assert_eq!(resolve_channel(&raw, &map), None);
    }

    #[test]
    fn does_not_leak_an_event_into_another_building_channel() {
        // bldg-1 allows temperature; the event is for bldg-2 (which has no prefs).
        // The pre-fix bug fanned this out to bldg-1's channel — assert it does not.
        let map = prefs(&[("bldg-1", &["temperature"])]);
        let raw = json!({ "type": "temperature", "buildingId": "bldg-2", "value": 22 });
        assert_eq!(resolve_channel(&raw, &map), None);
    }

    #[test]
    fn routes_to_the_correct_building_when_multiple_are_subscribed() {
        let map = prefs(&[("bldg-1", &["temperature"]), ("bldg-2", &["temperature"])]);
        let raw = json!({ "type": "temperature", "buildingId": "bldg-2", "value": 22 });
        assert_eq!(
            resolve_channel(&raw, &map),
            Some("telemetry:filtered:bldg-2".to_string())
        );
    }

    #[test]
    fn drops_event_missing_type_field() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        let raw = json!({ "buildingId": "bldg-1", "value": 22 });
        assert_eq!(resolve_channel(&raw, &map), None);
    }

    #[test]
    fn drops_event_missing_building_id_field() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        let raw = json!({ "type": "temperature", "value": 22 });
        assert_eq!(resolve_channel(&raw, &map), None);
    }
}
