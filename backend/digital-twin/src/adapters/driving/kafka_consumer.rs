use std::sync::Arc;
use std::time::Duration;

use crate::adapters::metrics::add_provision_duration;
use crate::adapters::topics::BUILDING_REGISTRATION_COMPLETED_TOPIC;
use crate::domain::DomainError;
use crate::service::provisioning::Provisioning;
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::Message;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use twin_schema::RegistrationCompleted;

const GROUP_ID: &str = "building-registrations-completed";
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq)]
enum Disposition {
    Settled,
    Retry,
}

pub fn spawn(brokers: &str, provisioning: Arc<Provisioning>) -> tokio::task::JoinHandle<()> {
    let brokers = brokers.to_string();
    tokio::spawn(async move {
        loop {
            match consume(&brokers, &provisioning).await {
                Ok(()) => log::warn!("registration stream ended, reconnecting"),
                Err(e) => log::error!("registration consumer failed: {e:?}"),
            }
            tokio::time::sleep(RECONNECT_DELAY).await;
        }
    })
}

async fn consume(brokers: &str, provisioning: &Provisioning) -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", GROUP_ID)
        .set("auto.offset.reset", "earliest")
        // A crash between reading an answer and resolving it must leave the answer unread.
        .set("enable.auto.commit", "false")
        .create()?;
    consumer.subscribe(&[BUILDING_REGISTRATION_COMPLETED_TOPIC])?;

    let mut stream = consumer.stream();
    while let Some(message) = stream.next().await {
        let message = match message {
            Ok(m) => m,
            Err(e) => {
                log::error!("registration consumer error: {e:?}");
                continue;
            }
        };

        // Reconnecting rewinds to the last commit, so the unresolved answer is read again.
        let payload = message.payload().unwrap_or_default();
        if handle_payload(payload, provisioning).await == Disposition::Retry {
            anyhow::bail!(
                "answer at offset {} unresolved, rereading",
                message.offset()
            );
        }
        if let Err(e) = consumer.commit_message(&message, CommitMode::Async) {
            log::error!(
                "failed to commit registration offset {}: {e:?}",
                message.offset()
            );
        }
    }
    Ok(())
}

/// Resolves one completion event; `Retry` only when a store failed, since rereading
/// a malformed or rejected event gives the same answer.
async fn handle_payload(payload: &[u8], provisioning: &Provisioning) -> Disposition {
    let event: RegistrationCompleted = match serde_json::from_slice(payload) {
        Ok(e) => e,
        Err(e) => {
            log::error!("malformed registration-completed event: {e:?}");
            return Disposition::Settled;
        }
    };

    let error = event.failure();
    match provisioning
        .resolve(&event.building_id, error.as_deref())
        .await
    {
        Ok(Some(elapsed)) => {
            let outcome = if error.is_some() { "failed" } else { "ready" };
            add_provision_duration(outcome, elapsed);
            Disposition::Settled
        }
        Ok(None) => Disposition::Settled,
        Err(e @ DomainError::Internal(_)) => {
            log::error!(
                "failed to resolve upload {} after registration completed: {e:?}",
                event.building_id
            );
            Disposition::Retry
        }
        Err(e) => {
            log::error!(
                "registration of {} cannot be resolved: {e:?}",
                event.building_id
            );
            Disposition::Settled
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::UploadStatus;
    use crate::service::fakes::{
        FakeEvents, FakeQueue, FakeStore, FakeSync, building, eng_editor,
    };
    use twin_schema::RegistrationCompleted;

    struct Harness {
        provisioning: Provisioning,
        store: Arc<FakeStore>,
        queue: Arc<FakeQueue>,
        sync: Arc<FakeSync>,
    }

    /// An upload already accepted and waiting for telemetry's answer -- the only
    /// state in which a completion event has anything to resolve.
    async fn pending(id: &str) -> Harness {
        let store = Arc::new(FakeStore::default());
        let queue = Arc::new(FakeQueue::default());
        let sync = Arc::new(FakeSync::default());
        let provisioning = Provisioning::new(
            store.clone(),
            queue.clone(),
            sync.clone(),
            Arc::new(FakeEvents::default()),
        );
        provisioning.accept(building(id), &eng_editor()).await.unwrap();
        store.seed(building(id));
        Harness {
            provisioning,
            store,
            queue,
            sync,
        }
    }

    fn encode(event: &RegistrationCompleted) -> Vec<u8> {
        serde_json::to_vec(event).unwrap()
    }

    #[tokio::test]
    async fn a_ready_event_resolves_the_upload() {
        let h = pending("b1").await;

        handle_payload(
            &encode(&RegistrationCompleted::ready("b1")),
            &h.provisioning,
        )
        .await;

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Ready
        );
        assert!(
            h.sync.failure_notifications.lock().unwrap().is_empty(),
            "a successful registration must not notify a failure"
        );
    }

    #[tokio::test]
    async fn a_failure_event_notifies_downstream_and_removes_the_orphaned_twin() {
        let h = pending("b1").await;
        let event = RegistrationCompleted {
            building_id: "b1".to_string(),
            status: "failed".to_string(),
            error: Some("telemetry rejected it".to_string()),
        };

        handle_payload(&encode(&event), &h.provisioning).await;

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Failed
        );
        assert_eq!(
            *h.sync.failure_notifications.lock().unwrap(),
            vec![("b1".to_string(), "telemetry rejected it".to_string())]
        );
        assert!(
            h.store.get("b1").is_none(),
            "a failed registration must not leave the twin behind"
        );
    }

    #[tokio::test]
    async fn a_failure_with_no_error_field_falls_back_to_the_status() {
        let h = pending("b1").await;
        let event = RegistrationCompleted {
            building_id: "b1".to_string(),
            status: "rejected".to_string(),
            error: None,
        };

        handle_payload(&encode(&event), &h.provisioning).await;

        assert_eq!(
            h.queue.errors.lock().unwrap().get("b1").map(String::as_str),
            Some("rejected"),
            "the status is the only description of the failure we have"
        );
    }

    #[tokio::test]
    async fn a_malformed_message_leaves_the_upload_alone() {
        let h = pending("b1").await;

        for payload in [b"{not json".to_vec(), b"{}".to_vec()] {
            assert_eq!(
                handle_payload(&payload, &h.provisioning).await,
                Disposition::Settled,
                "rereading a message we cannot read never helps"
            );
        }

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Pending,
            "a message we cannot read must not resolve anything"
        );
    }

    #[tokio::test]
    async fn a_redelivered_event_is_a_no_op() {
        // A crash between resolving and committing replays a message we already handled.
        let h = pending("b1").await;
        let payload = encode(&RegistrationCompleted::ready("b1"));

        handle_payload(&payload, &h.provisioning).await;
        handle_payload(&payload, &h.provisioning).await;

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Ready
        );
    }

    #[tokio::test]
    async fn a_resolution_the_queue_refuses_is_retried() {
        let provisioning = Provisioning::new(
            Arc::new(FakeStore::default()),
            Arc::new(FakeQueue {
                refuse: true,
                ..FakeQueue::default()
            }),
            Arc::new(FakeSync::default()),
            Arc::new(FakeEvents::default()),
        );

        let disposition =
            handle_payload(&encode(&RegistrationCompleted::ready("b1")), &provisioning).await;

        assert_eq!(disposition, Disposition::Retry);
    }

    #[tokio::test]
    async fn an_event_for_an_unknown_building_is_ignored() {
        let h = pending("b1").await;

        handle_payload(
            &encode(&RegistrationCompleted::ready("nobody")),
            &h.provisioning,
        )
        .await;

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Pending
        );
    }
}
