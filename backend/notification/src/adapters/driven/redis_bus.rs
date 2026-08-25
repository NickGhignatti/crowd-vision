use async_trait::async_trait;
use redis::AsyncTypedCommands;
use redis::aio::MultiplexedConnection;

use crate::domain::{NOTIFICATIONS_CHANNEL, Notification};
use crate::service::ports::{Cooldown, NotificationBus};

#[derive(Clone)]
pub struct RedisBus {
    connection: MultiplexedConnection,
}

impl RedisBus {
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let connection = redis::Client::open(url)?
            .get_multiplexed_async_connection()
            .await?;
        Ok(RedisBus { connection })
    }
}

#[async_trait]
impl NotificationBus for RedisBus {
    async fn publish(&self, notification: &Notification) -> anyhow::Result<()> {
        self.connection
            .clone()
            .publish(NOTIFICATIONS_CHANNEL, serde_json::to_string(notification)?)
            .await?;
        Ok(())
    }
}

#[async_trait]
impl Cooldown for RedisBus {
    async fn is_active(&self, key: &str) -> anyhow::Result<bool> {
        Ok(self.connection.clone().get(key).await?.is_some())
    }

    async fn start(&self, key: &str, seconds: u64) -> anyhow::Result<()> {
        self.connection.clone().set_ex(key, "1", seconds).await?;
        Ok(())
    }
}
