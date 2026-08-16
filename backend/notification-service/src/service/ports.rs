use async_trait::async_trait;

use crate::domain::{
    AccountPreferences, Notification, PreferenceUpdate, PushPayload, WebPushSubscription,
};

#[async_trait]
pub trait SubscriptionStore: Send + Sync {
    async fn upsert(&self, subscription: &WebPushSubscription) -> anyhow::Result<()>;
    async fn find_by_accounts(
        &self,
        account_names: &[String],
    ) -> anyhow::Result<Vec<WebPushSubscription>>;
    async fn delete_by_endpoint(&self, endpoint: &str) -> anyhow::Result<()>;
}

#[async_trait]
pub trait PreferenceStore: Send + Sync {
    async fn find_by_account(&self, account_name: &str) -> anyhow::Result<Vec<AccountPreferences>>;
    async fn set(&self, update: &PreferenceUpdate) -> anyhow::Result<()>;
    /// `notification_type: None` matches any type — the Node service dropped an
    /// `undefined` type out of the query, so `POST /trigger` without one fans out
    /// to every subscriber of the domain.
    async fn accounts_subscribed_to(
        &self,
        domain_name: &str,
        notification_type: Option<&str>,
    ) -> anyhow::Result<Vec<String>>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PushOutcome {
    Delivered,
    SubscriptionGone,
    Failed,
}

#[async_trait]
pub trait PushSender: Send + Sync {
    async fn send(&self, subscription: &WebPushSubscription, payload: &PushPayload) -> PushOutcome;
}

#[async_trait]
pub trait NotificationBus: Send + Sync {
    async fn publish(&self, notification: &Notification) -> anyhow::Result<()>;
}

#[async_trait]
pub trait Cooldown: Send + Sync {
    async fn is_active(&self, key: &str) -> anyhow::Result<bool>;
    async fn start(&self, key: &str, seconds: u64) -> anyhow::Result<()>;
}

#[async_trait]
pub trait DomainDirectory: Send + Sync {
    async fn domains_for_building(
        &self,
        building_name: &str,
        claims_header: &str,
    ) -> anyhow::Result<Vec<String>>;
}

pub trait Clock: Send + Sync {
    fn now_millis(&self) -> i64;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now_millis(&self) -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock is after the unix epoch")
            .as_millis() as i64
    }
}
