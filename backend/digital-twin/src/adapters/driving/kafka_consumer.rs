use std::sync::Arc;

use crate::adapters::metrics::add_provision_duration;
use crate::adapters::topics::BUILDING_REGISTRATION_COMPLETED_TOPIC;
use crate::service::provisioning::Provisioning;
use futures::StreamExt;
use rdkafka::ClientConfig;
use rdkafka::Message;
use rdkafka::consumer::{Consumer, StreamConsumer};
use twin_schema::RegistrationCompleted;

pub fn spawn(brokers: &str, provisioning: Arc<Provisioning>) -> tokio::task::JoinHandle<()> {
    let brokers = brokers.to_string();
    tokio::spawn(async move {
        let consumer: StreamConsumer = match ClientConfig::new()
            .set("bootstrap.servers", &brokers)
            .set("group.id", "building-registrations-completed")
            .set("enable.auto.commit", "true")
            .create()
        {
            Ok(c) => c,
            Err(e) => {
                log::error!("failed to build the registration consumer: {e:?}");
                return;
            }
        };

        if let Err(e) = consumer.subscribe(&[BUILDING_REGISTRATION_COMPLETED_TOPIC]) {
            log::error!("failed to subscribe to {BUILDING_REGISTRATION_COMPLETED_TOPIC}: {e:?}");
            return;
        }

        let mut stream = consumer.stream();
        while let Some(message) = stream.next().await {
            let payload = match message {
                Ok(m) => m.payload().map(|p| p.to_vec()),
                Err(e) => {
                    log::error!("registration consumer error: {e:?}");
                    continue;
                }
            };
            let Some(payload) = payload else { continue };

            handle_payload(&payload, &provisioning).await;
        }
    })
}

/// One message's worth of work, split out of the consumer loop so it is
/// reachable without a broker. Every path swallows its error on purpose: this
/// runs under `enable.auto.commit`, so returning would drop the consumer and
/// stall every later registration behind one bad message.
async fn handle_payload(payload: &[u8], provisioning: &Provisioning) {
    let event: RegistrationCompleted = match serde_json::from_slice(payload) {
        Ok(e) => e,
        Err(e) => {
            log::error!("malformed registration-completed event: {e:?}");
            return;
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
        }
        Ok(None) => {}
        Err(e) => log::error!(
            "failed to resolve upload {} after registration completed: {e:?}",
            event.building_id
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::UploadStatus;
    use crate::service::fakes::{FakeEvents, FakeQueue, FakeStore, FakeSync, building};
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
        provisioning.accept(building(id), "tok").await.unwrap();
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

        handle_payload(b"{not json", &h.provisioning).await;
        handle_payload(
            &serde_json::to_vec(&serde_json::json!({})).unwrap(),
            &h.provisioning,
        )
        .await;

        assert_eq!(
            h.provisioning.status("b1").await.unwrap(),
            UploadStatus::Pending,
            "a message we cannot read must not resolve anything"
        );
    }

    #[tokio::test]
    async fn a_redelivered_event_is_a_no_op() {
        // enable.auto.commit means a rebalance can replay a message we already handled.
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
