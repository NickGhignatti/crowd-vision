use std::time::Duration;

use async_trait::async_trait;
use redis::AsyncCommands;
use redis::aio::MultiplexedConnection;
use tokio::sync::Mutex;
use twin_schema::{Devices, devices_channel};

use crate::adapters::metrics::record_devices_published;
use crate::service::ports::DevicesFeed;

// A hung Redis must not stall the Wi-Fi consumer: the next tick replaces this one in 10 s.
const PUBLISH_TIMEOUT: Duration = Duration::from_secs(2);

/// Publishes each building's devices on its own channel; connects lazily and again after a failure.
pub struct RedisDevicesFeed {
    client: redis::Client,
    connection: Mutex<Option<MultiplexedConnection>>,
}

impl RedisDevicesFeed {
    pub fn new(url: &str) -> anyhow::Result<Self> {
        Ok(Self {
            client: redis::Client::open(url)?,
            connection: Mutex::default(),
        })
    }

    async fn send(&self, channel: &str, payload: String) -> anyhow::Result<()> {
        let mut held = self.connection.lock().await;
        let connection = match held.as_mut() {
            Some(connection) => connection,
            None => held.insert(self.client.get_multiplexed_async_connection().await?),
        };
        let sent: redis::RedisResult<()> = connection.publish(channel, payload).await;
        if sent.is_err() {
            *held = None;
        }
        Ok(sent?)
    }
}

fn message(devices: &Devices) -> (String, String) {
    (
        devices_channel(&devices.building_id),
        serde_json::to_string(devices).expect("devices always serialise"),
    )
}

#[async_trait]
impl DevicesFeed for RedisDevicesFeed {
    async fn publish(&self, devices: &Devices) {
        let (channel, payload) = message(devices);
        let outcome =
            match tokio::time::timeout(PUBLISH_TIMEOUT, self.send(&channel, payload)).await {
                Ok(Ok(())) => "ok",
                Ok(Err(e)) => {
                    log::warn!("devices of {} not published: {e:?}", devices.building_id);
                    "error"
                }
                Err(_) => {
                    log::warn!(
                        "devices of {} not published: timed out",
                        devices.building_id
                    );
                    *self.connection.lock().await = None;
                    "timeout"
                }
            };
        record_devices_published(outcome);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const WIRE: &str = include_str!("../../../../../schemas/fixtures/devices.json");

    #[test]
    fn every_fixture_tick_goes_out_on_its_buildings_channel_as_pinned() {
        let wire: Value = serde_json::from_str(WIRE).unwrap();
        for case in wire["cases"].as_array().unwrap() {
            let devices: Devices = serde_json::from_value(case["body"].clone()).unwrap();

            let (channel, payload) = message(&devices);

            assert_eq!(channel, format!("twin:devices:{}", devices.building_id));
            let sent: Value = serde_json::from_str(&payload).unwrap();
            assert_eq!(sent, case["body"], "{}", case["name"]);
        }
    }

    // Nothing listens on this port: publishing must give up and count it, not hang the consumer.
    #[tokio::test]
    async fn an_unreachable_redis_drops_the_tick_without_blocking() {
        let feed = RedisDevicesFeed::new("redis://127.0.0.1:1").unwrap();
        let before = crate::adapters::metrics::DEVICES_PUBLISHED_TOTAL
            .with_label_values(&["error"])
            .get();

        feed.publish(&Devices {
            building_id: "b1".to_owned(),
            tick: 1,
            devices: vec![],
        })
        .await;

        let after = crate::adapters::metrics::DEVICES_PUBLISHED_TOTAL
            .with_label_values(&["error"])
            .get();
        assert_eq!(after, before + 1);
    }
}
