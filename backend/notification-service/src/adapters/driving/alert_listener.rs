use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::StreamExt;
use rdkafka::consumer::{CommitMode, Consumer, StreamConsumer};
use rdkafka::message::{Header, Message, OwnedHeaders};
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::{ClientConfig, Offset, TopicPartitionList};

use crate::adapters::metrics;
use crate::domain::{ALERTS_DLQ_TOPIC, ALERTS_TOPIC};
use crate::service::alerts::Alerts;

pub const GROUP_ID: &str = "notification-service-alerts";

const IN_FLIGHT: usize = 16;
const RECONNECT_DELAY: Duration = Duration::from_secs(5);
const DLQ_TIMEOUT: Duration = Duration::from_secs(5);

/// What the consumer should do with a record once the service is done with it.
enum Disposition {
    /// Handled, or nothing could ever handle it. Safe to move past.
    Settled,
    /// Not delivered, and retrying in place would not help. Park it in the DLQ
    /// rather than drop it or wedge the partition behind it.
    Park(&'static str),
}

/// Tracks which offsets are safe to commit while records complete out of order.
///
/// A committed offset is a watermark, not a set: committing offset 20 asserts
/// everything below it is done. With concurrent handling, record 20 can finish
/// while 12 is still running, so committing on completion would silently skip
/// 12 if the process died. Only the contiguous run below the lowest in-flight
/// offset is ever committable.
#[derive(Default)]
struct Watermarks {
    partitions: HashMap<i32, Partition>,
}

#[derive(Default)]
struct Partition {
    in_flight: BTreeSet<i64>,
    completed: BTreeSet<i64>,
}

impl Watermarks {
    fn started(&mut self, partition: i32, offset: i64) {
        self.partitions
            .entry(partition)
            .or_default()
            .in_flight
            .insert(offset);
    }

    /// Marks one offset done and returns the highest offset now safe to commit,
    /// if completing this one advanced the watermark.
    fn finished(&mut self, partition: i32, offset: i64) -> Option<i64> {
        let state = self.partitions.entry(partition).or_default();
        state.in_flight.remove(&offset);
        state.completed.insert(offset);

        let lowest_running = state.in_flight.iter().next().copied();
        let committable: Vec<i64> = state
            .completed
            .iter()
            .take_while(|candidate| lowest_running.is_none_or(|running| **candidate < running))
            .copied()
            .collect();

        let watermark = committable.last().copied();
        for offset in committable {
            state.completed.remove(&offset);
        }
        watermark
    }
}

pub async fn listen(brokers: &str, alerts: Arc<Alerts>) -> anyhow::Result<()> {
    loop {
        match consume(brokers, alerts.clone()).await {
            Ok(()) => log::warn!("[Event] Alert stream ended, reconnecting"),
            Err(e) => log::error!("[Event] Alert consumer failed: {e}"),
        }
        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

async fn consume(brokers: &str, alerts: Arc<Alerts>) -> anyhow::Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("group.id", GROUP_ID)
        .set("auto.offset.reset", "earliest")
        // Offsets advance because this service says a record is done, not
        // because a timer fired. Without this, a crash can leave the offset
        // past a breach that was never delivered.
        .set("enable.auto.commit", "false")
        .create()?;
    consumer.subscribe(&[ALERTS_TOPIC])?;
    log::info!("[Event] Subscribed to {ALERTS_TOPIC}");

    let dead_letters: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", brokers)
        .set("message.timeout.ms", "5000")
        .set("enable.idempotence", "true")
        .create()?;

    let watermarks = Arc::new(Mutex::new(Watermarks::default()));
    let consumer = Arc::new(consumer);

    consumer
        .stream()
        .for_each_concurrent(IN_FLIGHT, |message| {
            let alerts = alerts.clone();
            let dead_letters = dead_letters.clone();
            let watermarks = watermarks.clone();
            let consumer = consumer.clone();
            async move {
                let message = match message {
                    Ok(message) => message,
                    Err(e) => {
                        log::error!("[Event] Failed to read an alert: {e}");
                        return;
                    }
                };
                let (partition, offset) = (message.partition(), message.offset());
                watermarks
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .started(partition, offset);

                if let Disposition::Park(reason) = handle(&alerts, message.payload()).await
                    && let Err(e) = park(&dead_letters, &message, reason).await
                {
                    // Leaving the offset uncommitted is the whole point: the
                    // record is still on the topic and will be redelivered.
                    log::error!("[Event] Failed to park an alert in {ALERTS_DLQ_TOPIC}: {e}");
                    return;
                }

                let watermark = watermarks
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .finished(partition, offset);
                if let Some(watermark) = watermark {
                    commit(&consumer, partition, watermark);
                }
            }
        })
        .await;
    Ok(())
}

fn commit(consumer: &StreamConsumer, partition: i32, watermark: i64) {
    let mut position = TopicPartitionList::new();
    // A committed offset names the next record to read, not the last one read.
    if let Err(e) =
        position.add_partition_offset(ALERTS_TOPIC, partition, Offset::Offset(watermark + 1))
    {
        log::error!("[Event] Failed to build the alert commit position: {e}");
        return;
    }
    if let Err(e) = consumer.commit(&position, CommitMode::Async) {
        log::error!("[Event] Failed to commit alerts up to {watermark}: {e}");
    }
}

async fn park(
    dead_letters: &FutureProducer,
    message: &rdkafka::message::BorrowedMessage<'_>,
    reason: &'static str,
) -> anyhow::Result<()> {
    let payload = message.payload().unwrap_or_default();
    let key = message.key().unwrap_or_default();
    let record = FutureRecord::to(ALERTS_DLQ_TOPIC)
        .key(key)
        .payload(payload)
        .headers(OwnedHeaders::new().insert(Header {
            key: "reason",
            value: Some(reason),
        }));

    dead_letters
        .send(record, DLQ_TIMEOUT)
        .await
        .map_err(|(error, _)| anyhow::anyhow!("{error}"))?;
    metrics::record_alert_parked(reason);
    Ok(())
}

async fn handle(alerts: &Alerts, payload: Option<&[u8]>) -> Disposition {
    let Some(raw) = payload.and_then(|bytes| std::str::from_utf8(bytes).ok()) else {
        metrics::record_alert_consumed("undecodable");
        return Disposition::Park("undecodable");
    };
    let outcome = alerts.on_breach(raw).await;
    metrics::record_alert_consumed(outcome.label());

    match outcome.label() {
        // Malformed beyond parsing, or a dependency was down. Neither is
        // fixed by reading the same record again in a moment.
        label @ ("invalid" | "failed") => Disposition::Park(label),
        _ => Disposition::Settled,
    }
}

#[cfg(test)]
mod tests {
    use super::Watermarks;

    #[test]
    fn a_lone_record_commits_itself() {
        let mut watermarks = Watermarks::default();
        watermarks.started(0, 7);

        assert_eq!(watermarks.finished(0, 7), Some(7));
    }

    #[test]
    fn a_later_record_finishing_first_commits_nothing() {
        let mut watermarks = Watermarks::default();
        watermarks.started(0, 1);
        watermarks.started(0, 2);

        assert_eq!(watermarks.finished(0, 2), None);
    }

    #[test]
    fn the_watermark_jumps_to_the_end_of_the_contiguous_run() {
        let mut watermarks = Watermarks::default();
        for offset in 1..=3 {
            watermarks.started(0, offset);
        }

        assert_eq!(watermarks.finished(0, 3), None);
        assert_eq!(watermarks.finished(0, 2), None);
        // 1 completing releases 1, 2 and 3 together.
        assert_eq!(watermarks.finished(0, 1), Some(3));
    }

    #[test]
    fn a_still_running_record_holds_the_watermark_below_it() {
        let mut watermarks = Watermarks::default();
        for offset in 1..=3 {
            watermarks.started(0, offset);
        }

        assert_eq!(watermarks.finished(0, 1), Some(1));
        assert_eq!(watermarks.finished(0, 3), None);
        assert_eq!(watermarks.finished(0, 2), Some(3));
    }

    #[test]
    fn partitions_advance_independently() {
        let mut watermarks = Watermarks::default();
        watermarks.started(0, 5);
        watermarks.started(1, 9);

        assert_eq!(watermarks.finished(1, 9), Some(9));
        assert_eq!(watermarks.finished(0, 5), Some(5));
    }

    #[test]
    fn a_committed_run_is_not_committed_twice() {
        let mut watermarks = Watermarks::default();
        watermarks.started(0, 1);
        watermarks.started(0, 2);

        assert_eq!(watermarks.finished(0, 1), Some(1));
        assert_eq!(watermarks.finished(0, 2), Some(2));
    }
}
