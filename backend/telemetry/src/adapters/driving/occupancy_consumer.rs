use crate::adapters::metrics::record_occupancy;
use crate::adapters::topics::ESTIMATED_OCCUPANCY_TOPIC;
use crate::kernel::occupancy::Occupancy;
use crate::types::error::DomainError;
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::message::Message;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinHandle;
use twin_schema::EstimatedOccupancy;

pub const GROUP_ID: &str = "estimated-occupancy";
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq)]
enum Disposition {
    Settled,
    Retry,
}

pub fn spawn(brokers: &str, occupancy: Arc<Occupancy>) -> JoinHandle<()> {
    let brokers = brokers.to_owned();
    tokio::spawn(async move {
        loop {
            match consume(&brokers, &occupancy).await {
                Ok(()) => log::warn!("occupancy stream ended, reconnecting"),
                Err(error) => log::error!("occupancy consumer failed: {error}"),
            }
            tokio::time::sleep(RECONNECT_DELAY).await;
        }
    })
}

async fn consume(brokers: &str, occupancy: &Occupancy) -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", GROUP_ID)
        // Counts are history: after an outage, store what the topic still holds.
        .set("auto.offset.reset", "earliest")
        .set("enable.auto.commit", "false")
        // Twin creates the topic; until then a subscription sees it only on a metadata refresh.
        .set("topic.metadata.refresh.interval.ms", "10000")
        .create()?;
    consumer.subscribe(&[ESTIMATED_OCCUPANCY_TOPIC])?;

    let mut stream = consumer.stream();
    while let Some(message) = stream.next().await {
        let message = match message {
            Ok(message) => message,
            Err(error) => {
                log::error!("occupancy consumer error: {error}");
                continue;
            }
        };
        // Reconnecting rewinds to the last commit; a repeated reading is dropped on insert.
        if handle(occupancy, message.payload()).await == Disposition::Retry {
            anyhow::bail!(
                "room counts at offset {} unstored, rereading",
                message.offset()
            );
        }
        if let Err(error) = consumer.commit_message(&message, CommitMode::Async) {
            log::error!(
                "failed to commit occupancy offset {}: {error}",
                message.offset()
            );
        }
    }
    Ok(())
}

/// Stores one message; one that can never be stored is dropped, a store failure is retried.
async fn handle(occupancy: &Occupancy, payload: Option<&[u8]>) -> Disposition {
    let parsed = payload.map(serde_json::from_slice::<EstimatedOccupancy>);
    let Some(Ok(counts)) = parsed else {
        log::error!("unreadable room counts dropped");
        record_occupancy("invalid");
        return Disposition::Settled;
    };
    match occupancy.accept(&counts).await {
        Ok(_) => {
            record_occupancy("stored");
            Disposition::Settled
        }
        Err(error @ (DomainError::Validation(_) | DomainError::Rejected(_))) => {
            log::error!("room counts of {} refused: {error}", counts.building_id);
            record_occupancy("invalid");
            Disposition::Settled
        }
        Err(error) => {
            log::error!("room counts of {} not stored: {error}", counts.building_id);
            record_occupancy("retried");
            Disposition::Retry
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{
        FakeAlerts, FakeBuildings, FakeFanout, FakePlugin, FakeReadings, FakeThresholds, FixedClock,
    };
    use crate::kernel::ingest::Ingest;
    use crate::kernel::ports::{
        Alerts, BuildingStore, Clock, Fanout, ReadingStore, ThresholdStore,
    };
    use crate::kernel::registry::PluginRegistry;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../../../../schemas/fixtures/estimated-occupancy.json");

    fn occupancy(readings: FakeReadings) -> (Occupancy, Arc<FakeReadings>) {
        let readings = Arc::new(readings);
        let registry = PluginRegistry::new(vec![Box::new(FakePlugin {
            key: "estimatedOccupancy",
        })])
        .unwrap();
        let occupancy = Occupancy {
            ingest: Arc::new(Ingest {
                registry: Arc::new(registry),
                readings: readings.clone() as Arc<dyn ReadingStore>,
                thresholds: Arc::new(FakeThresholds::default()) as Arc<dyn ThresholdStore>,
                fanout: Arc::new(FakeFanout::default()) as Arc<dyn Fanout>,
                alerts: Arc::new(FakeAlerts::default()) as Arc<dyn Alerts>,
                buildings: Arc::new(FakeBuildings::default()) as Arc<dyn BuildingStore>,
                clock: Arc::new(FixedClock::default()) as Arc<dyn Clock>,
            }),
        };
        (occupancy, readings)
    }

    fn bodies(group: &str) -> Vec<Vec<u8>> {
        let fixture: Value = serde_json::from_str(FIXTURE).unwrap();
        fixture[group]
            .as_array()
            .unwrap()
            .iter()
            .map(|case| case["body"].to_string().into_bytes())
            .collect()
    }

    #[tokio::test]
    async fn every_tick_the_fixture_pins_is_stored_and_settled() {
        let (occupancy, readings) = occupancy(FakeReadings::default());

        for body in bodies("cases") {
            assert_eq!(handle(&occupancy, Some(&body)).await, Disposition::Settled);
        }
        assert_eq!(readings.inserted.lock().unwrap().len(), 2);
    }

    // Rereading gives the same answer, so a message that cannot parse would block the topic.
    #[tokio::test]
    async fn every_tick_the_fixture_rejects_is_dropped_unstored() {
        let (occupancy, readings) = occupancy(FakeReadings::default());

        for body in bodies("rejected") {
            assert_eq!(handle(&occupancy, Some(&body)).await, Disposition::Settled);
        }
        assert_eq!(handle(&occupancy, None).await, Disposition::Settled);
        assert!(readings.inserted.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_store_that_refuses_is_retried() {
        let (occupancy, _) = occupancy(FakeReadings {
            refuse: true,
            ..Default::default()
        });

        let body = &bodies("cases")[0];
        assert_eq!(handle(&occupancy, Some(body)).await, Disposition::Retry);
    }
}
