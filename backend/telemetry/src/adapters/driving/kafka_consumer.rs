use crate::adapters::metrics;
use crate::adapters::topics::BUILDING_REGISTRATION_REQUESTED_TOPIC;
use crate::kernel::registration::Registration;
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::message::Message;
use serde_json::Value;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::task::JoinHandle;

pub const GROUP_ID: &str = "building-registrations";
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq)]
enum Disposition {
    Settled,
    Retry,
}

pub fn spawn(brokers: &str, group_id: &str, registration: Arc<Registration>) -> JoinHandle<()> {
    let brokers = brokers.to_owned();
    let group_id = group_id.to_owned();
    tokio::spawn(async move { listen(&brokers, &group_id, &registration).await })
}

async fn listen(brokers: &str, group_id: &str, registration: &Registration) {
    loop {
        match consume(brokers, group_id, registration).await {
            Ok(()) => log::warn!("registration stream ended, reconnecting"),
            Err(error) => log::error!("registration consumer failed: {error}"),
        }
        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

async fn consume(brokers: &str, group_id: &str, registration: &Registration) -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", group_id)
        .set("auto.offset.reset", "earliest")
        // A crash between reading a request and answering it must leave the request unread.
        .set("enable.auto.commit", "false")
        .create()?;
    consumer.subscribe(&[BUILDING_REGISTRATION_REQUESTED_TOPIC])?;

    let mut stream = consumer.stream();
    while let Some(message) = stream.next().await {
        let message = match message {
            Ok(message) => message,
            Err(error) => {
                log::error!("registration consumer error: {error}");
                continue;
            }
        };

        // Reconnecting rewinds to the last commit, so the unanswered request is read again.
        if handle(registration, message.payload()).await == Disposition::Retry {
            anyhow::bail!(
                "request at offset {} unanswered, rereading",
                message.offset()
            );
        }
        if let Err(error) = consumer.commit_message(&message, CommitMode::Async) {
            log::error!(
                "failed to commit registration offset {}: {error}",
                message.offset()
            );
        }
    }
    Ok(())
}

async fn handle(registration: &Registration, payload: Option<&[u8]>) -> Disposition {
    let Some(payload) = payload else {
        return Disposition::Settled;
    };
    let Ok(value) = serde_json::from_slice::<Value>(payload) else {
        log::error!("registration message is not valid json, dropping");
        return Disposition::Settled;
    };
    let Some(building_id) = value["buildingId"].as_str() else {
        log::error!("registration message has no buildingId, dropping");
        return Disposition::Settled;
    };

    let started = Instant::now();
    let outcome = registration.register_from_event(building_id, &value).await;
    metrics::record_registration(
        match &outcome {
            Ok(true) => "ready",
            Ok(false) => "failed",
            Err(_) => "unacknowledged",
        },
        started.elapsed(),
    );
    match outcome {
        Ok(_) => Disposition::Settled,
        Err(error) => {
            log::error!("failed to acknowledge registration of {building_id}: {error}");
            Disposition::Retry
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakeBuildings, FakeEvents, FakeThresholds};
    use crate::kernel::ports::{BuildingStore, RegistrationEvents, ThresholdStore};

    fn registration(events: FakeEvents) -> (Registration, Arc<FakeEvents>) {
        let events = Arc::new(events);
        let registration = Registration {
            buildings: Arc::new(FakeBuildings::default()) as Arc<dyn BuildingStore>,
            thresholds: Arc::new(FakeThresholds::default()) as Arc<dyn ThresholdStore>,
            events: events.clone() as Arc<dyn RegistrationEvents>,
        };
        (registration, events)
    }

    fn request(building_id: &str) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "buildingId": building_id, "name": "HQ", "rooms": []
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn an_acknowledged_request_is_settled() {
        let (registration, events) = registration(FakeEvents::default());

        let disposition = handle(&registration, Some(&request("b1"))).await;

        assert_eq!(disposition, Disposition::Settled);
        assert_eq!(events.completed.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_rejected_request_is_settled_once_the_failure_is_published() {
        let (registration, events) = registration(FakeEvents::default());
        let nameless = serde_json::to_vec(&serde_json::json!({ "buildingId": "b1" })).unwrap();

        let disposition = handle(&registration, Some(&nameless)).await;

        assert_eq!(disposition, Disposition::Settled);
        assert!(events.completed.lock().unwrap()[0].1.is_err());
    }

    #[tokio::test]
    async fn a_request_whose_answer_cannot_be_published_is_retried() {
        let (registration, _) = registration(FakeEvents {
            refuse: true,
            ..FakeEvents::default()
        });

        let disposition = handle(&registration, Some(&request("b1"))).await;

        assert_eq!(disposition, Disposition::Retry);
    }

    #[tokio::test]
    async fn an_unreadable_message_is_settled_without_an_answer() {
        let (registration, events) = registration(FakeEvents::default());
        let no_id = serde_json::to_vec(&serde_json::json!({ "name": "HQ" })).unwrap();

        for payload in [None, Some(&b"not json"[..]), Some(&no_id[..])] {
            assert_eq!(handle(&registration, payload).await, Disposition::Settled);
        }
        assert!(events.completed.lock().unwrap().is_empty());
    }
}
