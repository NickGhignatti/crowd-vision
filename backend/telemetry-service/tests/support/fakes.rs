use async_trait::async_trait;
use std::sync::Mutex;
use telemetry_service::contracts::event::{AlertPayload, TelemetryEvent};
use telemetry_service::kernel::ports::{
    Alerts, BuildingDirectory, Clock, Fanout, RegistrationEvents,
};

pub struct StubDirectory {
    pub domains: Vec<String>,
}

#[async_trait]
impl BuildingDirectory for StubDirectory {
    async fn domains_of(&self, _building_id: &str, _claims: &str) -> anyhow::Result<Vec<String>> {
        Ok(self.domains.clone())
    }
}

#[derive(Default)]
pub struct StubFanout {
    pub published: Mutex<Vec<TelemetryEvent>>,
    pub batches: Mutex<Vec<Vec<TelemetryEvent>>>,
}

#[async_trait]
impl Fanout for StubFanout {
    async fn publish_telemetry(&self, events: &[TelemetryEvent]) {
        self.batches.lock().unwrap().push(events.to_vec());
        self.published
            .lock()
            .unwrap()
            .extend(events.iter().cloned());
    }
}

#[derive(Default)]
pub struct StubAlerts {
    pub published: Mutex<Vec<AlertPayload>>,
}

#[async_trait]
impl Alerts for StubAlerts {
    async fn publish_breach(&self, alert: &AlertPayload) {
        self.published.lock().unwrap().push(alert.clone());
    }
}

#[derive(Default)]
pub struct StubEvents;

#[async_trait]
impl RegistrationEvents for StubEvents {
    async fn publish_completed(
        &self,
        _building_id: &str,
        _outcome: Result<(), String>,
    ) -> anyhow::Result<()> {
        Ok(())
    }
}

pub struct StubClock(pub i64);

impl Default for StubClock {
    fn default() -> Self {
        Self(1_700_000_000_000)
    }
}

impl Clock for StubClock {
    fn now_ms(&self) -> i64 {
        self.0
    }
}
