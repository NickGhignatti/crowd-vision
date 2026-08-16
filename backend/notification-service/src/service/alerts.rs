use std::sync::Arc;

use crate::domain::{
    COOLDOWN_SECONDS, DomainError, ManualTemperatureAlert, Notification, PushPayload, TEMPERATURE,
    TemperatureAlert, system_claims_header,
};
use crate::service::ports::{Clock, Cooldown, DomainDirectory, NotificationBus};
use crate::service::push::Push;

pub struct Alerts {
    bus: Arc<dyn NotificationBus>,
    cooldown: Arc<dyn Cooldown>,
    domain_directory: Arc<dyn DomainDirectory>,
    push: Arc<Push>,
    clock: Arc<dyn Clock>,
}

impl Alerts {
    pub fn new(
        bus: Arc<dyn NotificationBus>,
        cooldown: Arc<dyn Cooldown>,
        domain_directory: Arc<dyn DomainDirectory>,
        push: Arc<Push>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Alerts {
            bus,
            cooldown,
            domain_directory,
            push,
            clock,
        }
    }

    /// The `alerts:temperature` path. No authenticated caller, so it debounces,
    /// resolves the building's domains itself, and never propagates an error.
    pub async fn on_temperature_breach(&self, raw: &str) {
        let alert: TemperatureAlert = match serde_json::from_str(raw) {
            Ok(alert) => alert,
            Err(e) => {
                log::error!("[Event] Failed to process temperature alert: {e}");
                return;
            }
        };

        let key = alert.cooldown_key();
        match self.cooldown.is_active(&key).await {
            Ok(true) => return,
            Ok(false) => {}
            Err(e) => {
                log::error!("[Event] Failed to read the alert cooldown: {e:?}");
                return;
            }
        }

        let message = alert.message();
        let domains = match alert.building_id.as_deref().filter(|b| !b.is_empty()) {
            Some(building) => self
                .domain_directory
                .domains_for_building(building, &system_claims_header())
                .await
                .unwrap_or_else(|e| {
                    log::error!("[Event] Failed to resolve domains for building {building}: {e:?}");
                    Vec::new()
                }),
            None => Vec::new(),
        };

        if domains.is_empty() {
            let at = alert.timestamp.unwrap_or_else(|| self.clock.now_millis());
            self.publish(&message, "danger", None, at).await;
        } else {
            self.fan_out(&message, &alert.push_title(), &domains, Some(TEMPERATURE))
                .await;
        }

        if let Err(e) = self.cooldown.start(&key, COOLDOWN_SECONDS).await {
            log::error!("[Event] Failed to arm the alert cooldown: {e:?}");
        }
    }

    /// `POST /trigger`. The caller's own claims header is forwarded to twin-service.
    pub async fn trigger(
        &self,
        message: Option<&str>,
        kind: Option<&str>,
        building_name: Option<&str>,
        notification_type: Option<&str>,
        claims_header: &str,
    ) -> Result<(), DomainError> {
        let message = message
            .filter(|m| !m.is_empty())
            .unwrap_or("Manual Alert Triggered");
        let kind = kind.filter(|t| !t.is_empty()).unwrap_or("alert");
        let building = building_name.filter(|b| !b.is_empty()).ok_or_else(|| {
            DomainError::Validation("Missing required field: buildingName".to_string())
        })?;

        let domains = self
            .domain_directory
            .domains_for_building(building, claims_header)
            .await
            .map_err(DomainError::Internal)?;

        for domain_name in &domains {
            let now = self.clock.now_millis();
            self.publish(message, kind, Some(domain_name.clone()), now)
                .await;
            if !domain_name.is_empty() {
                self.push
                    .to_domain(
                        &PushPayload::new(Some("CrowdVision Alert"), Some(message), None),
                        domain_name,
                        notification_type,
                    )
                    .await;
            }
        }
        Ok(())
    }

    /// `POST /push/temperature`. Same debounce as the broker path, but a caller-supplied
    /// domain short-circuits the building lookup and an unresolvable one is a 400.
    pub async fn push_temperature(
        &self,
        alert: &ManualTemperatureAlert,
        claims_header: &str,
    ) -> Result<(), DomainError> {
        let key = alert.cooldown_key();
        if self
            .cooldown
            .is_active(&key)
            .await
            .map_err(DomainError::Internal)?
        {
            return Ok(());
        }

        let targets = match alert.domain_name.as_deref().filter(|d| !d.is_empty()) {
            Some(domain) => vec![domain.to_string()],
            None => match alert.building_id.as_deref().filter(|b| !b.is_empty()) {
                Some(building) => self
                    .domain_directory
                    .domains_for_building(building, claims_header)
                    .await
                    .map_err(DomainError::Internal)?,
                None => Vec::new(),
            },
        };

        let targets = unique_non_empty(&targets);
        if targets.is_empty() {
            return Err(DomainError::Validation(
                "domainName/domainId (or buildingId fallback) is required".to_string(),
            ));
        }

        self.fan_out(
            &alert.message(),
            &alert.push_title(),
            &targets,
            Some(alert.notification_type()),
        )
        .await;

        self.cooldown
            .start(&key, COOLDOWN_SECONDS)
            .await
            .map_err(DomainError::Internal)
    }

    async fn fan_out(
        &self,
        message: &str,
        push_title: &str,
        domains: &[String],
        notification_type: Option<&str>,
    ) {
        for domain_name in unique_non_empty(domains) {
            let now = self.clock.now_millis();
            self.publish(message, "danger", Some(domain_name.clone()), now)
                .await;
            self.push
                .to_domain(
                    &PushPayload::new(Some(push_title), Some(message), None),
                    &domain_name,
                    notification_type,
                )
                .await;
        }
    }

    async fn publish(&self, message: &str, kind: &str, domain_name: Option<String>, at: i64) {
        let notification =
            Notification::new(self.clock.now_millis(), at, message, kind, domain_name);
        if let Err(e) = self.bus.publish(&notification).await {
            log::error!("Failed to publish a notification: {e:?}");
        }
    }
}

fn unique_non_empty(domains: &[String]) -> Vec<String> {
    let mut unique: Vec<String> = Vec::new();
    for domain in domains.iter().filter(|d| !d.is_empty()) {
        if !unique.contains(domain) {
            unique.push(domain.clone());
        }
    }
    unique
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{AccountPreferences, Preference, SubscriptionKeys, WebPushSubscription};
    use crate::service::fakes::{
        FrozenClock, InMemoryCooldown, InMemoryPreferences, InMemorySubscriptions, RecordingBus,
        RecordingSender, StubDirectory,
    };

    const NOW: i64 = 1_700_000_000_000;

    struct Fixture {
        alerts: Alerts,
        bus: Arc<RecordingBus>,
        cooldown: Arc<InMemoryCooldown>,
        directory: Arc<StubDirectory>,
        sender: Arc<RecordingSender>,
    }

    fn fixture(directory: StubDirectory) -> Fixture {
        let subscriptions = Arc::new(InMemorySubscriptions::default());
        let preferences = Arc::new(InMemoryPreferences::default());
        let sender = Arc::new(RecordingSender::default());
        let bus = Arc::new(RecordingBus::default());
        let cooldown = Arc::new(InMemoryCooldown::default());
        let directory = Arc::new(directory);

        *preferences.records.lock().unwrap() = vec![AccountPreferences {
            account_name: "ada".to_string(),
            domain_name: "domain-a".to_string(),
            preferences: vec![Preference {
                notification_type: TEMPERATURE.to_string(),
                is_subscribed: true,
            }],
            created_at: "1970-01-01T00:00:00.000Z".to_string(),
        }];
        subscriptions
            .subscriptions
            .lock()
            .unwrap()
            .push(WebPushSubscription {
                account_name: "ada".to_string(),
                endpoint: "https://push/ada".to_string(),
                keys: SubscriptionKeys {
                    p256dh: "p".to_string(),
                    auth: "a".to_string(),
                },
            });

        let push = Arc::new(Push::new(subscriptions, preferences, sender.clone()));
        Fixture {
            alerts: Alerts::new(
                bus.clone(),
                cooldown.clone(),
                directory.clone(),
                push,
                Arc::new(FrozenClock(NOW)),
            ),
            bus,
            cooldown,
            directory,
            sender,
        }
    }

    fn breach() -> String {
        serde_json::json!({
            "buildingId": "b1",
            "roomId": "r1",
            "temperature": 40,
            "direction": "high",
            "timestamp": 1_600_000_000_000i64,
        })
        .to_string()
    }

    fn published(fixture: &Fixture) -> Vec<Notification> {
        fixture.bus.published.lock().unwrap().clone()
    }

    #[tokio::test]
    async fn a_breach_publishes_a_domain_scoped_alert_and_pushes_to_its_subscribers() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_temperature_breach(&breach()).await;

        let published = published(&fixture);
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].message, "b1 : r1 is 40°C (above maximum)");
        assert_eq!(published[0].kind, "danger");
        assert_eq!(published[0].domain_name.as_deref(), Some("domain-a"));
        assert_eq!(fixture.sender.endpoints(), vec!["https://push/ada"]);
    }

    #[tokio::test]
    async fn a_breach_arms_a_five_minute_cooldown_keyed_by_building_and_room() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_temperature_breach(&breach()).await;

        assert_eq!(
            *fixture.cooldown.started.lock().unwrap(),
            vec![("temp_alert:b1:r1".to_string(), 300)]
        );
    }

    #[tokio::test]
    async fn an_active_cooldown_suppresses_the_lookup_the_publish_and_the_rearm() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));
        fixture
            .cooldown
            .active
            .lock()
            .unwrap()
            .push("temp_alert:b1:r1".to_string());

        fixture.alerts.on_temperature_breach(&breach()).await;

        assert!(fixture.directory.calls.lock().unwrap().is_empty());
        assert!(published(&fixture).is_empty());
        assert!(fixture.cooldown.started.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_failed_lookup_falls_back_to_an_unscoped_broadcast_and_still_arms_the_cooldown() {
        let fixture = fixture(StubDirectory::failing());

        fixture.alerts.on_temperature_breach(&breach()).await;

        let published = published(&fixture);
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].domain_name, None);
        assert_eq!(published[0].message, "b1 : r1 is 40°C (above maximum)");
        assert_eq!(fixture.cooldown.started.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_building_in_no_domain_also_falls_back_to_an_unscoped_broadcast() {
        let fixture = fixture(StubDirectory::empty());

        fixture.alerts.on_temperature_breach(&breach()).await;

        assert_eq!(published(&fixture)[0].domain_name, None);
    }

    #[tokio::test]
    async fn the_unscoped_broadcast_carries_the_alerts_own_timestamp() {
        let fixture = fixture(StubDirectory::empty());

        fixture.alerts.on_temperature_breach(&breach()).await;

        let published = published(&fixture);
        assert_eq!(published[0].timestamp, "2020-09-13T12:26:40.000Z");
        assert_eq!(published[0].id, NOW.to_string());
    }

    #[tokio::test]
    async fn the_lookup_uses_the_system_identity() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_temperature_breach(&breach()).await;

        let calls = fixture.directory.calls.lock().unwrap();
        assert_eq!(calls[0].0, "b1");
        assert_eq!(calls[0].1, system_claims_header());
    }

    #[tokio::test]
    async fn a_malformed_message_publishes_nothing_and_does_not_panic() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_temperature_breach("not-json").await;

        assert!(published(&fixture).is_empty());
        assert!(fixture.cooldown.started.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_listener_survives_a_malformed_message_and_handles_the_next_one() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_temperature_breach("not-json").await;
        fixture.alerts.on_temperature_breach(&breach()).await;

        assert_eq!(published(&fixture).len(), 1);
    }

    #[tokio::test]
    async fn duplicate_domains_are_delivered_once() {
        let fixture = fixture(StubDirectory::returning(
            "b1",
            &["domain-a", "domain-a", ""],
        ));

        fixture.alerts.on_temperature_breach(&breach()).await;

        assert_eq!(published(&fixture).len(), 1);
    }

    #[tokio::test]
    async fn triggering_without_a_building_name_is_a_validation_error() {
        let fixture = fixture(StubDirectory::empty());

        let result = fixture
            .alerts
            .trigger(None, None, None, None, "claims")
            .await;

        assert!(matches!(
            result,
            Err(DomainError::Validation(m)) if m == "Missing required field: buildingName"
        ));
    }

    #[tokio::test]
    async fn triggering_defaults_the_message_and_type() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture
            .alerts
            .trigger(None, None, Some("b1"), None, "claims")
            .await
            .unwrap();

        let published = published(&fixture);
        assert_eq!(published[0].message, "Manual Alert Triggered");
        assert_eq!(published[0].kind, "alert");
    }

    #[tokio::test]
    async fn triggering_forwards_the_callers_own_claims_header() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture
            .alerts
            .trigger(Some("hi"), None, Some("b1"), None, "caller-claims")
            .await
            .unwrap();

        assert_eq!(
            fixture.directory.calls.lock().unwrap()[0].1,
            "caller-claims"
        );
    }

    #[tokio::test]
    async fn a_failed_lookup_on_trigger_is_an_internal_error() {
        let fixture = fixture(StubDirectory::failing());

        let result = fixture
            .alerts
            .trigger(Some("hi"), None, Some("b1"), None, "claims")
            .await;

        assert!(matches!(result, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn a_manual_push_prefers_the_supplied_domain_over_the_building_lookup() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-b"]));
        let alert = ManualTemperatureAlert {
            building_id: Some("b1".into()),
            room_id: Some("r1".into()),
            temperature: Some(21.5),
            domain_name: Some("domain-a".into()),
            notification_type: None,
        };

        fixture
            .alerts
            .push_temperature(&alert, "claims")
            .await
            .unwrap();

        let published = published(&fixture);
        assert_eq!(published[0].domain_name.as_deref(), Some("domain-a"));
        assert_eq!(published[0].message, "Temperature alert in room r1: 21.5 C");
        assert!(fixture.directory.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_manual_push_falls_back_to_the_building_lookup() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));
        let alert = ManualTemperatureAlert {
            building_id: Some("b1".into()),
            ..Default::default()
        };

        fixture
            .alerts
            .push_temperature(&alert, "claims")
            .await
            .unwrap();

        assert_eq!(
            published(&fixture)[0].domain_name.as_deref(),
            Some("domain-a")
        );
    }

    #[tokio::test]
    async fn a_manual_push_with_no_resolvable_domain_is_a_validation_error() {
        let fixture = fixture(StubDirectory::empty());

        let result = fixture
            .alerts
            .push_temperature(&ManualTemperatureAlert::default(), "claims")
            .await;

        assert!(matches!(
            result,
            Err(DomainError::Validation(m))
                if m == "domainName/domainId (or buildingId fallback) is required"
        ));
    }

    #[tokio::test]
    async fn a_manual_push_within_the_cooldown_publishes_nothing_but_succeeds() {
        let fixture = fixture(StubDirectory::empty());
        fixture
            .cooldown
            .active
            .lock()
            .unwrap()
            .push("temp_alert:b1:r1".to_string());
        let alert = ManualTemperatureAlert {
            building_id: Some("b1".into()),
            room_id: Some("r1".into()),
            domain_name: Some("domain-a".into()),
            ..Default::default()
        };

        fixture
            .alerts
            .push_temperature(&alert, "claims")
            .await
            .unwrap();

        assert!(published(&fixture).is_empty());
        assert!(fixture.cooldown.started.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_manual_push_arms_the_cooldown_after_delivering() {
        let fixture = fixture(StubDirectory::empty());
        let alert = ManualTemperatureAlert {
            building_id: Some("b1".into()),
            room_id: Some("r1".into()),
            domain_name: Some("domain-a".into()),
            ..Default::default()
        };

        fixture
            .alerts
            .push_temperature(&alert, "claims")
            .await
            .unwrap();

        assert_eq!(
            *fixture.cooldown.started.lock().unwrap(),
            vec![("temp_alert:b1:r1".to_string(), 300)]
        );
    }
}
