use std::sync::Arc;

use telemetry_schema::AlertEvent;

use crate::domain::{
    Audience, COOLDOWN_SECONDS, DomainError, Notification, Severity, breach_cooldown_key,
    breach_message, breach_push_title, notification, system_claims_header,
};
use crate::service::ports::{Clock, Cooldown, DomainDirectory, NotificationBus};
use crate::service::push::Push;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BreachOutcome {
    Invalid,
    Unsupported,
    Failed,
    Suppressed,
    Delivered,
    Unroutable,
}

impl BreachOutcome {
    pub fn label(self) -> &'static str {
        match self {
            BreachOutcome::Invalid => "invalid",
            BreachOutcome::Unsupported => "unsupported_metric",
            BreachOutcome::Failed => "failed",
            BreachOutcome::Suppressed => "suppressed",
            BreachOutcome::Delivered => "delivered",
            BreachOutcome::Unroutable => "unroutable",
        }
    }
}

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

    pub async fn on_breach(&self, raw: &str) -> BreachOutcome {
        let alert: AlertEvent = match serde_json::from_str(raw) {
            Ok(alert) => alert,
            Err(e) => {
                log::error!("[Event] Failed to process alert: {e}");
                return BreachOutcome::Invalid;
            }
        };

        if !alert.is_alertable() {
            log::warn!(
                "[Event] No delivery path for a {} breach in building {}, dropping",
                alert.metric,
                alert.building_id
            );
            return BreachOutcome::Unsupported;
        }

        let key = breach_cooldown_key(&alert);
        match self.cooldown.is_active(&key).await {
            Ok(true) => return BreachOutcome::Suppressed,
            Ok(false) => {}
            Err(e) => {
                log::error!("[Event] Failed to read the alert cooldown: {e:?}");
                return BreachOutcome::Failed;
            }
        }

        let message = breach_message(&alert);
        let building = alert.building_id.as_str();
        let domains = self
            .domain_directory
            .domains_for_building(building, &system_claims_header())
            .await
            .unwrap_or_else(|e| {
                log::error!("[Event] Failed to resolve domains for building {building}: {e:?}");
                Vec::new()
            });

        let outcome = if domains.is_empty() {
            log::error!(
                "[Event] {label} alert for building {building} reached no domain: no web push was sent and only open sockets can receive it. Alert: {message}",
                label = alert.label
            );
            self.publish(&notification(
                self.clock.now_millis(),
                alert.ts_ms,
                Severity::Danger,
                &breach_push_title(&alert),
                &message,
                None,
            ))
            .await;
            BreachOutcome::Unroutable
        } else {
            self.fan_out(
                &message,
                &breach_push_title(&alert),
                &domains,
                Some(alert.metric.as_str()),
            )
            .await;
            BreachOutcome::Delivered
        };

        if let Err(e) = self.cooldown.start(&key, COOLDOWN_SECONDS).await {
            log::error!("[Event] Failed to arm the alert cooldown: {e:?}");
        }
        outcome
    }

    pub async fn trigger(
        &self,
        message: Option<&str>,
        kind: Option<&str>,
        building_name: Option<&str>,
        notification_type: Option<&str>,
        claims_header: &str,
        audience: &Audience,
    ) -> Result<(), DomainError> {
        let message = message
            .filter(|m| !m.is_empty())
            .unwrap_or("Manual Alert Triggered");
        let severity = match kind.filter(|t| !t.is_empty()) {
            Some(kind) => kind.parse().map_err(|_| {
                DomainError::Validation("type must be one of: info, warning, danger".to_string())
            })?,
            None => Severity::Danger,
        };
        let building = building_name.filter(|b| !b.is_empty()).ok_or_else(|| {
            DomainError::Validation("Missing required field: buildingName".to_string())
        })?;

        let domains = self
            .domain_directory
            .domains_for_building(building, claims_header)
            .await
            .map_err(DomainError::Internal)?;

        let permitted = permitted_by(&domains, audience);
        if permitted.is_empty() && !domains.is_empty() {
            return Err(DomainError::Forbidden(
                "Not a member of any domain for this building".to_string(),
            ));
        }

        for domain_name in &permitted {
            let now = self.clock.now_millis();
            let sent = notification(
                now,
                now,
                severity,
                "CrowdVision Alert",
                message,
                Some(domain_name.clone()),
            );
            self.publish(&sent).await;
            if !domain_name.is_empty() {
                self.push
                    .to_domain(&sent, domain_name, notification_type)
                    .await;
            }
        }
        Ok(())
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
            let sent = notification(
                now,
                now,
                Severity::Danger,
                push_title,
                message,
                Some(domain_name.clone()),
            );
            self.publish(&sent).await;
            self.push
                .to_domain(&sent, &domain_name, notification_type)
                .await;
        }
    }

    async fn publish(&self, sent: &Notification) {
        if let Err(e) = self.bus.publish(sent).await {
            log::error!("Failed to publish a notification: {e:?}");
        }
    }
}

fn permitted_by(domains: &[String], audience: &Audience) -> Vec<String> {
    domains
        .iter()
        .filter(|domain| audience.permits(domain))
        .cloned()
        .collect()
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
    use crate::domain::{
        AccountPreferences, Preference, SubscriptionKeys, TEMPERATURE, WebPushSubscription,
    };
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
        fixture_at(directory, NOW)
    }

    fn fixture_at(directory: StubDirectory, now: i64) -> Fixture {
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
                Arc::new(FrozenClock(now)),
            ),
            bus,
            cooldown,
            directory,
            sender,
        }
    }

    fn temperature() -> AlertEvent {
        AlertEvent {
            building_id: "b1".to_string(),
            room_id: "r1".to_string(),
            building_name: "HQ".to_string(),
            room_name: "Lab 1".to_string(),
            metric: "temperature".to_string(),
            field: "temperature".to_string(),
            value: 40.0,
            label: "Temperature".to_string(),
            unit: Some("°C".to_string()),
            direction: telemetry_schema::BoundDirection::Above,
            threshold: 25.0,
            ts_ms: 1_600_000_000_000,
        }
    }

    fn co2() -> AlertEvent {
        AlertEvent {
            metric: "airQuality".to_string(),
            field: "co2".to_string(),
            value: 1200.0,
            label: "CO2".to_string(),
            unit: Some("ppm".to_string()),
            threshold: 1000.0,
            ..temperature()
        }
    }

    fn breach() -> String {
        serde_json::to_string(&temperature()).unwrap()
    }

    fn breach_of(metric: &str, value: f64) -> String {
        serde_json::to_string(&AlertEvent {
            metric: metric.to_string(),
            field: metric.to_string(),
            value,
            label: metric.to_string(),
            unit: None,
            ..temperature()
        })
        .unwrap()
    }

    fn published(fixture: &Fixture) -> Vec<Notification> {
        fixture.bus.published.lock().unwrap().clone()
    }

    fn member_of(domains: &[&str]) -> Audience {
        Audience::Domains(domains.iter().map(|d| d.to_string()).collect())
    }

    fn every_domain() -> Audience {
        member_of(&["domain-a", "domain-b"])
    }

    const WIRE: &str = include_str!("../../../../schemas/fixtures/notification.json");

    fn wire_case(name: &str) -> serde_json::Value {
        let wire: serde_json::Value = serde_json::from_str(WIRE).unwrap();
        let cases = wire["cases"].as_array().unwrap();
        cases.iter().find(|c| c["name"] == name).unwrap()["body"].clone()
    }

    fn wire_breach() -> String {
        serde_json::to_string(&AlertEvent {
            building_id: "bldg-3f2b4c5d".to_string(),
            room_id: "room-lab-2".to_string(),
            building_name: "Innovation Hub".to_string(),
            room_name: "Lab 2".to_string(),
            metric: "temperature".to_string(),
            field: "temperature".to_string(),
            value: 31.4,
            label: "Temperature".to_string(),
            unit: Some("°C".to_string()),
            direction: telemetry_schema::BoundDirection::Above,
            threshold: 28.0,
            ts_ms: 1_757_251_200_000,
        })
        .unwrap()
    }

    #[tokio::test]
    async fn a_scoped_breach_publishes_the_wire_fixture_byte_for_byte() {
        let fixture = fixture_at(
            StubDirectory::returning("bldg-3f2b4c5d", &["eng"]),
            1_757_251_200_000,
        );

        fixture.alerts.on_breach(&wire_breach()).await;

        assert_eq!(
            serde_json::to_value(&published(&fixture)[0]).unwrap(),
            wire_case("temperature breach, scoped to its domain")
        );
    }

    #[tokio::test]
    async fn an_unroutable_breach_publishes_the_wire_fixture_byte_for_byte() {
        let fixture = fixture_at(StubDirectory::empty(), 1_757_251_200_000);

        fixture.alerts.on_breach(&wire_breach()).await;

        assert_eq!(
            serde_json::to_value(&published(&fixture)[0]).unwrap(),
            wire_case("unroutable breach, broadcast to every client")
        );
    }

    #[tokio::test]
    async fn triggering_with_a_type_outside_the_closed_set_is_a_validation_error() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        let result = fixture
            .alerts
            .trigger(
                None,
                Some("alert"),
                Some("b1"),
                None,
                "claims",
                &every_domain(),
            )
            .await;

        assert!(matches!(
            result,
            Err(DomainError::Validation(m)) if m == "type must be one of: info, warning, danger"
        ));
        assert!(published(&fixture).is_empty());
    }

    #[tokio::test]
    async fn a_breach_publishes_a_domain_scoped_alert_and_pushes_to_its_subscribers() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_breach(&breach()).await;

        let published = published(&fixture);
        assert_eq!(published.len(), 1);
        assert_eq!(
            published[0].message,
            "HQ : Lab 1 Temperature is 40 °C (above maximum)"
        );
        assert_eq!(published[0].r#type, Severity::Danger);
        assert_eq!(published[0].domain_name.as_deref(), Some("domain-a"));
        assert_eq!(fixture.sender.endpoints(), vec!["https://push/ada"]);
        assert_eq!(fixture.sender.sent.lock().unwrap()[0].1, published[0]);
    }

    #[tokio::test]
    async fn a_metric_with_no_delivery_path_is_dropped_and_said_so() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        let outcome = fixture.alerts.on_breach(&breach_of("humidity", 80.0)).await;

        assert_eq!(outcome, BreachOutcome::Unsupported);
        assert_eq!(outcome.label(), "unsupported_metric");
        assert!(published(&fixture).is_empty());
        assert!(fixture.sender.endpoints().is_empty());
        assert!(fixture.cooldown.started.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_air_quality_breach_is_delivered_in_its_own_words_to_its_own_subscribers() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        let outcome = fixture
            .alerts
            .on_breach(&serde_json::to_string(&co2()).unwrap())
            .await;

        assert_eq!(outcome, BreachOutcome::Delivered);
        let published = published(&fixture);
        assert_eq!(
            published[0].message,
            "HQ : Lab 1 CO2 is 1200 ppm (above maximum)"
        );
        assert_eq!(published[0].title, "CO2 Alert - HQ");
        assert!(
            fixture.sender.endpoints().is_empty(),
            "ada opted into temperature only"
        );
    }

    #[tokio::test]
    async fn a_co2_cooldown_never_silences_a_temperature_breach_in_the_same_room() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));
        fixture
            .cooldown
            .active
            .lock()
            .unwrap()
            .push("alert:airQuality:co2:b1:r1".to_string());

        let outcome = fixture.alerts.on_breach(&breach()).await;

        assert_eq!(outcome, BreachOutcome::Delivered);
    }

    #[tokio::test]
    async fn an_alert_that_is_not_the_shape_the_producer_writes_is_invalid() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        for raw in [
            "not json",
            r#"{"buildingId":"b1","roomId":"r1","type":"temperature"}"#,
            r#"{"roomId":"r1","temperature":40,"type":"temperature","direction":"high","threshold":25,"timestamp":1}"#,
        ] {
            assert_eq!(fixture.alerts.on_breach(raw).await, BreachOutcome::Invalid);
        }
        assert!(published(&fixture).is_empty());
    }

    #[tokio::test]
    async fn a_breach_arms_a_five_minute_cooldown_keyed_by_building_and_room() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_breach(&breach()).await;

        assert_eq!(
            *fixture.cooldown.started.lock().unwrap(),
            vec![("alert:temperature:temperature:b1:r1".to_string(), 300)]
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
            .push("alert:temperature:temperature:b1:r1".to_string());

        fixture.alerts.on_breach(&breach()).await;

        assert!(fixture.directory.calls.lock().unwrap().is_empty());
        assert!(published(&fixture).is_empty());
        assert!(fixture.cooldown.started.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_alert_that_reaches_no_domain_is_reported_as_unroutable() {
        let fixture = fixture(StubDirectory::empty());

        let outcome = fixture.alerts.on_breach(&breach()).await;

        assert_eq!(outcome, BreachOutcome::Unroutable);
    }

    #[tokio::test]
    async fn a_failed_lookup_is_also_reported_as_unroutable() {
        let fixture = fixture(StubDirectory::failing());

        let outcome = fixture.alerts.on_breach(&breach()).await;

        assert_eq!(outcome, BreachOutcome::Unroutable);
    }

    #[tokio::test]
    async fn an_alert_fanned_out_to_a_domain_is_reported_as_delivered() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        let outcome = fixture.alerts.on_breach(&breach()).await;

        assert_eq!(outcome, BreachOutcome::Delivered);
    }

    #[tokio::test]
    async fn an_alert_inside_the_cooldown_is_reported_as_suppressed() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));
        fixture
            .cooldown
            .active
            .lock()
            .unwrap()
            .push("alert:temperature:temperature:b1:r1".to_string());

        let outcome = fixture.alerts.on_breach(&breach()).await;

        assert_eq!(outcome, BreachOutcome::Suppressed);
    }

    #[tokio::test]
    async fn a_malformed_message_is_reported_as_invalid() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        let outcome = fixture.alerts.on_breach("not-json").await;

        assert_eq!(outcome, BreachOutcome::Invalid);
    }

    #[tokio::test]
    async fn a_failed_lookup_falls_back_to_an_unscoped_broadcast_and_still_arms_the_cooldown() {
        let fixture = fixture(StubDirectory::failing());

        fixture.alerts.on_breach(&breach()).await;

        let published = published(&fixture);
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].domain_name, None);
        assert_eq!(
            published[0].message,
            "HQ : Lab 1 Temperature is 40 °C (above maximum)"
        );
        assert_eq!(fixture.cooldown.started.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_building_in_no_domain_also_falls_back_to_an_unscoped_broadcast() {
        let fixture = fixture(StubDirectory::empty());

        fixture.alerts.on_breach(&breach()).await;

        assert_eq!(published(&fixture)[0].domain_name, None);
    }

    #[tokio::test]
    async fn the_unscoped_broadcast_carries_the_alerts_own_timestamp() {
        let fixture = fixture(StubDirectory::empty());

        fixture.alerts.on_breach(&breach()).await;

        let published = published(&fixture);
        assert_eq!(published[0].timestamp, "2020-09-13T12:26:40.000Z");
        assert_eq!(published[0].id, NOW.to_string());
    }

    #[tokio::test]
    async fn the_lookup_uses_the_system_identity() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_breach(&breach()).await;

        let calls = fixture.directory.calls.lock().unwrap();
        assert_eq!(calls[0].0, "b1");
        assert_eq!(calls[0].1, system_claims_header());
    }

    #[tokio::test]
    async fn a_malformed_message_publishes_nothing_and_does_not_panic() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_breach("not-json").await;

        assert!(published(&fixture).is_empty());
        assert!(fixture.cooldown.started.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_listener_survives_a_malformed_message_and_handles_the_next_one() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture.alerts.on_breach("not-json").await;
        fixture.alerts.on_breach(&breach()).await;

        assert_eq!(published(&fixture).len(), 1);
    }

    #[tokio::test]
    async fn duplicate_domains_are_delivered_once() {
        let fixture = fixture(StubDirectory::returning(
            "b1",
            &["domain-a", "domain-a", ""],
        ));

        fixture.alerts.on_breach(&breach()).await;

        assert_eq!(published(&fixture).len(), 1);
    }

    #[tokio::test]
    async fn triggering_without_a_building_name_is_a_validation_error() {
        let fixture = fixture(StubDirectory::empty());

        let result = fixture
            .alerts
            .trigger(None, None, None, None, "claims", &every_domain())
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
            .trigger(None, None, Some("b1"), None, "claims", &every_domain())
            .await
            .unwrap();

        let published = published(&fixture);
        assert_eq!(published[0].message, "Manual Alert Triggered");
        assert_eq!(published[0].r#type, Severity::Danger);
    }

    #[tokio::test]
    async fn triggering_forwards_the_callers_own_claims_header() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        fixture
            .alerts
            .trigger(
                Some("hi"),
                None,
                Some("b1"),
                None,
                "caller-claims",
                &every_domain(),
            )
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
            .trigger(
                Some("hi"),
                None,
                Some("b1"),
                None,
                "claims",
                &every_domain(),
            )
            .await;

        assert!(matches!(result, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn triggering_skips_the_buildings_domains_the_caller_is_not_a_member_of() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a", "domain-b"]));

        fixture
            .alerts
            .trigger(
                Some("hi"),
                None,
                Some("b1"),
                None,
                "claims",
                &member_of(&["domain-b"]),
            )
            .await
            .unwrap();

        let published = published(&fixture);
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].domain_name.as_deref(), Some("domain-b"));
    }

    #[tokio::test]
    async fn triggering_for_a_building_sharing_no_domain_with_the_caller_is_forbidden() {
        let fixture = fixture(StubDirectory::returning("b1", &["domain-a"]));

        let result = fixture
            .alerts
            .trigger(
                Some("hi"),
                None,
                Some("b1"),
                None,
                "claims",
                &member_of(&["domain-z"]),
            )
            .await;

        assert!(matches!(result, Err(DomainError::Forbidden(_))));
        assert!(published(&fixture).is_empty());
    }

    #[tokio::test]
    async fn triggering_for_a_building_with_no_domains_at_all_still_succeeds() {
        let fixture = fixture(StubDirectory::returning("b1", &[]));

        fixture
            .alerts
            .trigger(
                Some("hi"),
                None,
                Some("b1"),
                None,
                "claims",
                &Audience::Unrestricted,
            )
            .await
            .unwrap();

        assert!(published(&fixture).is_empty());
    }
}
