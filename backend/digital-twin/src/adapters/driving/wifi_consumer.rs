use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::adapters::metrics::record_wifi_tick;
use crate::adapters::topics::WIFI_OBSERVATIONS_TOPIC;
use crate::service::tracking::{Observed, Tracking};
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use twin_schema::WifiObservations;

const GROUP_ID: &str = "wifi-observations";
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

pub fn spawn(brokers: &str, tracking: Arc<Tracking>) -> tokio::task::JoinHandle<()> {
    let brokers = brokers.to_string();
    tokio::spawn(async move {
        loop {
            match consume(&brokers, &tracking).await {
                Ok(()) => log::warn!("wifi observation stream ended, reconnecting"),
                Err(e) => log::error!("wifi observation consumer failed: {e:?}"),
            }
            tokio::time::sleep(RECONNECT_DELAY).await;
        }
    })
}

async fn consume(brokers: &str, tracking: &Tracking) -> anyhow::Result<()> {
    // A missed tick is replaced ten seconds later, so start at the newest and never reread.
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", GROUP_ID)
        .set("auto.offset.reset", "latest")
        .set("enable.auto.commit", "true")
        // Telemetry creates the topic; until then a subscription sees it only on a metadata refresh.
        .set("topic.metadata.refresh.interval.ms", "10000")
        .create()?;
    consumer.subscribe(&[WIFI_OBSERVATIONS_TOPIC])?;

    let mut stream = consumer.stream();
    while let Some(message) = stream.next().await {
        match message {
            Ok(message) => {
                handle_payload(message.payload().unwrap_or_default(), tracking, now_ms()).await;
            }
            Err(e) => log::error!("wifi observation consumer error: {e:?}"),
        }
    }
    Ok(())
}

/// Hands one tick to tracking; one it cannot read is dropped, since rereading gives the same answer.
async fn handle_payload(payload: &[u8], tracking: &Tracking, now_ms: u64) -> Observed {
    let tick: WifiObservations = match serde_json::from_slice(payload) {
        Ok(tick) => tick,
        Err(e) => {
            log::warn!("unreadable wifi tick dropped: {e}");
            record_wifi_tick(Observed::Invalid.as_str(), None);
            return Observed::Invalid;
        }
    };
    let lag = Duration::from_millis(now_ms.saturating_sub(tick.tick));
    let building = tick.building_id.clone();
    let observed = tracking.observe(tick, now_ms).await;
    if observed != Observed::Accepted {
        log::warn!("wifi tick for {building} dropped as {}", observed.as_str());
    }
    record_wifi_tick(observed.as_str(), Some(lag));
    observed
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::fakes::{FakePlacements, FakeStore};
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../../../../schemas/fixtures/wifi-observations.json");

    fn cases(group: &str) -> Vec<Value> {
        let fixture: Value = serde_json::from_str(FIXTURE).expect("fixture parses");
        fixture[group].as_array().expect("fixture group").clone()
    }

    fn at(body: &Value) -> u64 {
        body["tick"].as_u64().unwrap()
    }

    fn tracking() -> Tracking {
        Tracking::new(
            Arc::new(FakeStore::default()),
            Arc::new(FakePlacements::default()),
        )
    }

    #[tokio::test]
    async fn every_tick_the_fixture_pins_is_accepted() {
        for case in cases("cases") {
            let tracking = tracking();
            let body = &case["body"];

            let observed = handle_payload(body.to_string().as_bytes(), &tracking, at(body)).await;

            assert_eq!(observed, Observed::Accepted, "{}", case["name"]);
            let held = tracking.held_tick(body["buildingId"].as_str().unwrap());
            assert_eq!(held, Some(at(body)), "{}", case["name"]);
        }
    }

    // Telemetry checked these already; twin does not take the broker's word for it.
    #[tokio::test]
    async fn every_tick_the_fixture_rejects_is_dropped() {
        for case in cases("rejected") {
            let tracking = tracking();
            let body = &case["body"];

            let observed =
                handle_payload(body.to_string().as_bytes(), &tracking, 1_761_300_000_000).await;

            assert_eq!(observed, Observed::Invalid, "{}", case["name"]);
            assert_eq!(
                tracking.held_tick("bldg-3f2b4c5d"),
                None,
                "{}",
                case["name"]
            );
        }
    }

    #[tokio::test]
    async fn a_payload_that_is_not_a_tick_is_dropped() {
        let tracking = tracking();

        for payload in [b"{not json".as_slice(), b"{}", b""] {
            assert_eq!(
                handle_payload(payload, &tracking, 0).await,
                Observed::Invalid
            );
        }
    }

    #[tokio::test]
    async fn a_tick_read_long_after_its_snapshot_is_dropped_as_stale() {
        let tracking = tracking();
        let body = &cases("cases")[0]["body"];

        let observed =
            handle_payload(body.to_string().as_bytes(), &tracking, at(body) + 600_000).await;

        assert_eq!(observed, Observed::Stale);
        assert_eq!(
            tracking.held_tick(body["buildingId"].as_str().unwrap()),
            None
        );
    }
}
