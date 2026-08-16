use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::domain::{
    AccountPreferences, Notification, Preference, PreferenceUpdate, PushPayload,
    WebPushSubscription,
};
use crate::service::ports::{
    Clock, Cooldown, DomainDirectory, NotificationBus, PreferenceStore, PushOutcome, PushSender,
    SubscriptionStore,
};

#[derive(Default)]
pub struct InMemorySubscriptions {
    pub subscriptions: Mutex<Vec<WebPushSubscription>>,
}

#[async_trait]
impl SubscriptionStore for InMemorySubscriptions {
    async fn upsert(&self, subscription: &WebPushSubscription) -> anyhow::Result<()> {
        let mut stored = self.subscriptions.lock().unwrap();
        stored.retain(|s| s.endpoint != subscription.endpoint);
        stored.push(subscription.clone());
        Ok(())
    }

    async fn find_by_accounts(
        &self,
        account_names: &[String],
    ) -> anyhow::Result<Vec<WebPushSubscription>> {
        Ok(self
            .subscriptions
            .lock()
            .unwrap()
            .iter()
            .filter(|s| account_names.contains(&s.account_name))
            .cloned()
            .collect())
    }

    async fn delete_by_endpoint(&self, endpoint: &str) -> anyhow::Result<()> {
        self.subscriptions
            .lock()
            .unwrap()
            .retain(|s| s.endpoint != endpoint);
        Ok(())
    }
}

#[derive(Default)]
pub struct InMemoryPreferences {
    pub records: Mutex<Vec<AccountPreferences>>,
}

#[async_trait]
impl PreferenceStore for InMemoryPreferences {
    async fn find_by_account(&self, account_name: &str) -> anyhow::Result<Vec<AccountPreferences>> {
        Ok(self
            .records
            .lock()
            .unwrap()
            .iter()
            .filter(|r| r.account_name == account_name)
            .cloned()
            .collect())
    }

    async fn set(&self, update: &PreferenceUpdate) -> anyhow::Result<()> {
        let mut records = self.records.lock().unwrap();
        let record = match records
            .iter_mut()
            .find(|r| r.account_name == update.account_name && r.domain_name == update.domain_name)
        {
            Some(existing) => existing,
            None => {
                records.push(AccountPreferences {
                    account_name: update.account_name.clone(),
                    domain_name: update.domain_name.clone(),
                    preferences: Vec::new(),
                    created_at: "1970-01-01T00:00:00.000Z".to_string(),
                });
                records.last_mut().unwrap()
            }
        };
        record
            .preferences
            .retain(|p| p.notification_type != update.notification_type);
        record.preferences.push(Preference {
            notification_type: update.notification_type.clone(),
            is_subscribed: update.enabled,
        });
        Ok(())
    }

    async fn accounts_subscribed_to(
        &self,
        domain_name: &str,
        notification_type: Option<&str>,
    ) -> anyhow::Result<Vec<String>> {
        let mut accounts: Vec<String> = Vec::new();
        for record in self.records.lock().unwrap().iter() {
            let matches = record.domain_name == domain_name
                && record.preferences.iter().any(|p| {
                    p.is_subscribed && notification_type.is_none_or(|t| p.notification_type == t)
                });
            if matches && !accounts.contains(&record.account_name) {
                accounts.push(record.account_name.clone());
            }
        }
        Ok(accounts)
    }
}

#[derive(Default)]
pub struct RecordingBus {
    pub published: Mutex<Vec<Notification>>,
}

#[async_trait]
impl NotificationBus for RecordingBus {
    async fn publish(&self, notification: &Notification) -> anyhow::Result<()> {
        self.published.lock().unwrap().push(notification.clone());
        Ok(())
    }
}

#[derive(Default)]
pub struct InMemoryCooldown {
    pub active: Mutex<Vec<String>>,
    pub started: Mutex<Vec<(String, u64)>>,
}

#[async_trait]
impl Cooldown for InMemoryCooldown {
    async fn is_active(&self, key: &str) -> anyhow::Result<bool> {
        Ok(self.active.lock().unwrap().iter().any(|k| k == key))
    }

    async fn start(&self, key: &str, seconds: u64) -> anyhow::Result<()> {
        self.started
            .lock()
            .unwrap()
            .push((key.to_string(), seconds));
        Ok(())
    }
}

pub struct StubDirectory {
    pub domains: HashMap<String, Vec<String>>,
    pub fails: bool,
    pub calls: Mutex<Vec<(String, String)>>,
}

impl StubDirectory {
    pub fn returning(building: &str, domains: &[&str]) -> Self {
        StubDirectory {
            domains: HashMap::from([(
                building.to_string(),
                domains.iter().map(|d| d.to_string()).collect(),
            )]),
            fails: false,
            calls: Mutex::new(Vec::new()),
        }
    }

    pub fn failing() -> Self {
        StubDirectory {
            domains: HashMap::new(),
            fails: true,
            calls: Mutex::new(Vec::new()),
        }
    }

    pub fn empty() -> Self {
        StubDirectory {
            domains: HashMap::new(),
            fails: false,
            calls: Mutex::new(Vec::new()),
        }
    }
}

#[async_trait]
impl DomainDirectory for StubDirectory {
    async fn domains_for_building(
        &self,
        building_name: &str,
        claims_header: &str,
    ) -> anyhow::Result<Vec<String>> {
        self.calls
            .lock()
            .unwrap()
            .push((building_name.to_string(), claims_header.to_string()));
        if self.fails {
            anyhow::bail!("Twin lookup failed for building {building_name}");
        }
        Ok(self.domains.get(building_name).cloned().unwrap_or_default())
    }
}

#[derive(Default)]
pub struct RecordingSender {
    pub sent: Mutex<Vec<(String, PushPayload)>>,
    pub gone: Vec<String>,
    pub failing: Vec<String>,
}

impl RecordingSender {
    pub fn with_gone(endpoints: &[&str]) -> Self {
        RecordingSender {
            gone: endpoints.iter().map(|e| e.to_string()).collect(),
            ..Default::default()
        }
    }

    pub fn with_failing(endpoints: &[&str]) -> Self {
        RecordingSender {
            failing: endpoints.iter().map(|e| e.to_string()).collect(),
            ..Default::default()
        }
    }

    pub fn endpoints(&self) -> Vec<String> {
        let mut endpoints: Vec<String> = self
            .sent
            .lock()
            .unwrap()
            .iter()
            .map(|(endpoint, _)| endpoint.clone())
            .collect();
        endpoints.sort();
        endpoints
    }
}

#[async_trait]
impl PushSender for RecordingSender {
    async fn send(&self, subscription: &WebPushSubscription, payload: &PushPayload) -> PushOutcome {
        self.sent
            .lock()
            .unwrap()
            .push((subscription.endpoint.clone(), payload.clone()));
        if self.gone.contains(&subscription.endpoint) {
            PushOutcome::SubscriptionGone
        } else if self.failing.contains(&subscription.endpoint) {
            PushOutcome::Failed
        } else {
            PushOutcome::Delivered
        }
    }
}

pub struct FrozenClock(pub i64);

impl Clock for FrozenClock {
    fn now_millis(&self) -> i64 {
        self.0
    }
}
