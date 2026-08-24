use crate::infra::metrics;
use crate::state::AppState;
use dashmap::DashMap;
use futures::StreamExt;
use log::info;
use redis::aio::MultiplexedConnection;
use telemetry_contracts::{RAW_CHANNEL, TelemetryEnvelope};
use tokio::task;

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

        let envelope: TelemetryEnvelope = match serde_json::from_str(&payload) {
            Ok(envelope) => envelope,
            Err(e) => {
                info!("Raw telemetry is not a tick envelope, skipping: {e}");
                continue;
            }
        };

        let state_clone = state.clone();
        let pub_conn_clone = publish_conn.clone();

        // Spawn a Tokio task for the fan-out.
        // This ensures the ingestion stream is NEVER blocked by processing time.
        task::spawn(async move {
            process_and_publish(envelope, payload, state_clone, pub_conn_clone).await;
        });
    }
}

/// Decides which `telemetry:filtered:*` channel to forward a tick to, or `None` to drop it.
fn resolve_channel(
    envelope: &TelemetryEnvelope,
    building_preferences: &DashMap<String, Vec<String>>,
) -> Option<String> {
    if !building_preferences.contains_key(&envelope.building_id) {
        info!(
            "No preferences found for building {}, skipping",
            envelope.building_id
        );
        return None;
    }

    // No metric filtering: every sensor metric a known building emits is forwarded;
    // which columns the dashboard displays is a client concern.
    Some(envelope.channel())
}

async fn process_and_publish(
    envelope: TelemetryEnvelope,
    payload: String,
    state: AppState,
    mut publish_conn: MultiplexedConnection,
) {
    metrics::EVENTS_RECEIVED.inc();

    let Some(channel) = resolve_channel(&envelope, &state.building_preferences) else {
        return;
    };

    // The tick is relayed exactly as telemetry-service published it: a reading's
    // fields belong to whichever plugin produced them, and re-serialising here
    // would put this service in the way of a shape it has no business knowing.
    let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
        .arg(&channel)
        .arg(payload)
        .query_async(&mut publish_conn)
        .await;

    let ingested_at = envelope.ingested_at_ms;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(ingested_at);
    metrics::FANOUT_LATENCY_MS.observe((now_ms - ingested_at).max(0) as f64);

    metrics::EVENTS_PUBLISHED.inc();
}

#[cfg(test)]
mod tests {
    use super::resolve_channel;
    use dashmap::DashMap;
    use serde_json::json;
    use telemetry_contracts::TelemetryEnvelope;

    fn envelope(raw: serde_json::Value) -> TelemetryEnvelope {
        serde_json::from_value(raw).expect("tick parses")
    }

    fn tick(building_id: &str, metric: &str) -> TelemetryEnvelope {
        envelope(json!({
            "buildingId": building_id,
            "ingestedAt": 1_700_000_000_000i64,
            "readings": [{ "type": metric, "value": 22 }],
        }))
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
    fn a_tick_carries_its_building_its_time_and_its_readings() {
        let parsed = tick("bldg-1", "temperature");
        assert_eq!(parsed.building_id, "bldg-1");
        assert_eq!(parsed.ingested_at_ms, 1_700_000_000_000);
        assert_eq!(parsed.readings.len(), 1);
    }

    #[test]
    fn a_message_that_is_not_a_tick_never_becomes_one() {
        for raw in [
            json!({ "buildingId": "bldg-1", "ingestedAt": 1 }),
            json!({ "buildingId": "bldg-1", "ingestedAt": 1, "readings": 42 }),
            json!({ "ingestedAt": 1, "readings": [] }),
            json!({ "buildingId": 42, "ingestedAt": 1, "readings": [] }),
            json!({ "buildingId": "bldg-1", "readings": [] }),
            json!({}),
        ] {
            assert!(
                serde_json::from_value::<TelemetryEnvelope>(raw.clone()).is_err(),
                "{raw} must not parse as a tick"
            );
        }
    }

    #[test]
    fn routes_a_tick_to_its_own_building_channel() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        assert_eq!(
            resolve_channel(&tick("bldg-1", "temperature"), &map),
            Some("telemetry:filtered:bldg-1".to_string())
        );
    }

    #[test]
    fn forwards_any_metric_for_a_known_building() {
        // The dashboard column set doesn't gate telemetry: an unlisted metric
        // is still forwarded (display filtering is the client's job).
        let map = prefs(&[("bldg-1", &["temperature"])]);
        assert_eq!(
            resolve_channel(&tick("bldg-1", "air_quality"), &map),
            Some("telemetry:filtered:bldg-1".to_string())
        );
    }

    #[test]
    fn drops_a_tick_for_a_building_with_no_preferences() {
        let map = prefs(&[("bldg-1", &["temperature"])]);
        assert_eq!(
            resolve_channel(&tick("bldg-unknown", "temperature"), &map),
            None
        );
    }

    #[test]
    fn does_not_leak_a_tick_into_another_building_channel() {
        // bldg-1 allows temperature; the tick is for bldg-2 (which has no prefs).
        // The pre-fix bug fanned this out to bldg-1's channel — assert it does not.
        let map = prefs(&[("bldg-1", &["temperature"])]);
        assert_eq!(resolve_channel(&tick("bldg-2", "temperature"), &map), None);
    }

    #[test]
    fn routes_to_the_correct_building_when_multiple_are_subscribed() {
        let map = prefs(&[("bldg-1", &["temperature"]), ("bldg-2", &["temperature"])]);
        assert_eq!(
            resolve_channel(&tick("bldg-2", "temperature"), &map),
            Some("telemetry:filtered:bldg-2".to_string())
        );
    }
}
