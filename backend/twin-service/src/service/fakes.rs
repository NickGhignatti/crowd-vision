use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;

use crate::domain::identity::{ClaimsPayload, GatewayClaims, Membership};
use crate::domain::{AcceptedUpload, Building, Coordinates, Dimensions, Room, UploadStatus};
use crate::service::ports::{BuildingStore, DownstreamSync, RegistrationEvents, UploadQueue};

pub fn claims_with(memberships: Vec<(&str, &str)>) -> GatewayClaims {
    GatewayClaims {
        payload: ClaimsPayload {
            sub: "u1".to_string(),
            memberships: memberships
                .into_iter()
                .map(|(domain, role)| Membership {
                    domain: domain.to_string(),
                    role: Some(role.to_string()),
                })
                .collect(),
        },
        raw: "raw-token".to_string(),
    }
}

pub fn room(id: &str) -> Room {
    Room {
        id: id.to_string(),
        name: id.to_string(),
        capacity: 10.0,
        position: Coordinates {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        },
        dimensions: Dimensions {
            width: 1.0,
            height: 1.0,
            depth: 1.0,
        },
        color: None,
    }
}

pub fn building(id: &str) -> Building {
    Building {
        id: id.to_string(),
        name: "Engineering Block".to_string(),
        rooms: vec![room("r1")],
        domains: vec!["eng".to_string()],
    }
}

#[derive(Default)]
pub struct FakeStore {
    pub written: Mutex<Vec<Building>>,
}

impl FakeStore {
    pub fn seed(&self, building: Building) {
        self.written.lock().unwrap().push(building);
    }

    pub fn get(&self, id: &str) -> Option<Building> {
        self.written
            .lock()
            .unwrap()
            .iter()
            .find(|b| b.id == id)
            .cloned()
    }
}

#[async_trait]
impl BuildingStore for FakeStore {
    async fn find_by_id(&self, id: &str) -> anyhow::Result<Option<Building>> {
        Ok(self.get(id))
    }

    async fn find_by_domain(&self, domain: &str) -> anyhow::Result<Vec<Building>> {
        Ok(self
            .written
            .lock()
            .unwrap()
            .iter()
            .filter(|b| b.domains.iter().any(|d| d == domain))
            .cloned()
            .collect())
    }

    async fn find_by_name(&self, name: &str) -> anyhow::Result<Vec<Building>> {
        Ok(self
            .written
            .lock()
            .unwrap()
            .iter()
            .filter(|b| b.name == name)
            .cloned()
            .collect())
    }

    async fn upsert(&self, building: &Building) -> anyhow::Result<()> {
        let mut written = self.written.lock().unwrap();
        written.retain(|b| b.id != building.id);
        written.push(building.clone());
        Ok(())
    }

    async fn delete(&self, id: &str) -> anyhow::Result<()> {
        self.written.lock().unwrap().retain(|b| b.id != id);
        Ok(())
    }

    async fn counts_by_domain(&self, domains: &[String]) -> anyhow::Result<HashMap<String, i64>> {
        let written = self.written.lock().unwrap();
        let mut counts = HashMap::new();
        for building in written.iter() {
            for domain in &building.domains {
                if domains.contains(domain) {
                    *counts.entry(domain.clone()).or_insert(0) += 1;
                }
            }
        }
        Ok(counts)
    }
}

#[derive(Default)]
pub struct FakeQueue {
    pub pending: Mutex<Vec<AcceptedUpload>>,
    pub statuses: Mutex<HashMap<String, UploadStatus>>,
    pub errors: Mutex<HashMap<String, String>>,
    pub accepted_at: Mutex<HashMap<String, Instant>>,
}

impl FakeQueue {
    fn resolve(&self, id: &str, status: UploadStatus) -> Option<Duration> {
        let mut statuses = self.statuses.lock().unwrap();
        if statuses.get(id) != Some(&UploadStatus::Pending) {
            return None;
        }
        statuses.insert(id.to_string(), status);
        self.accepted_at
            .lock()
            .unwrap()
            .get(id)
            .map(|at| at.elapsed())
    }
}

#[async_trait]
impl UploadQueue for FakeQueue {
    async fn enqueue(&self, upload: &AcceptedUpload) -> anyhow::Result<()> {
        self.pending.lock().unwrap().push(upload.clone());
        self.statuses
            .lock()
            .unwrap()
            .insert(upload.id.clone(), UploadStatus::Pending);
        self.accepted_at
            .lock()
            .unwrap()
            .insert(upload.id.clone(), Instant::now());
        Ok(())
    }

    async fn claim(&self, _lease: Duration) -> anyhow::Result<Option<AcceptedUpload>> {
        let mut pending = self.pending.lock().unwrap();
        if pending.is_empty() {
            return Ok(None);
        }
        Ok(Some(pending.remove(0)))
    }

    async fn mark_ready(&self, id: &str) -> anyhow::Result<Option<Duration>> {
        Ok(self.resolve(id, UploadStatus::Ready))
    }

    async fn mark_failed(&self, id: &str, error: &str) -> anyhow::Result<Option<Duration>> {
        let elapsed = self.resolve(id, UploadStatus::Failed);
        self.errors
            .lock()
            .unwrap()
            .insert(id.to_string(), error.to_string());
        Ok(elapsed)
    }

    async fn status(&self, id: &str) -> anyhow::Result<Option<UploadStatus>> {
        Ok(self.statuses.lock().unwrap().get(id).copied())
    }
}

#[derive(Default)]
pub struct FakeSync {
    pub cloned: Mutex<Vec<(String, Option<f64>)>>,
    pub seeded_preferences: Mutex<Vec<String>>,
    pub seeded_rooms: Mutex<Vec<String>>,
    pub failure_notifications: Mutex<Vec<(String, String)>>,
    pub refuse: bool,
}

#[async_trait]
impl DownstreamSync for FakeSync {
    async fn clone_thresholds(
        &self,
        building: &Building,
        max_temperature: Option<f64>,
        _claims: &str,
    ) -> anyhow::Result<()> {
        if self.refuse {
            anyhow::bail!("sensor-service said no");
        }
        self.cloned
            .lock()
            .unwrap()
            .push((building.id.clone(), max_temperature));
        Ok(())
    }

    async fn init_preferences(&self, building_id: &str, _claims: &str) {
        self.seeded_preferences
            .lock()
            .unwrap()
            .push(building_id.to_string());
    }

    async fn init_room_thresholds(
        &self,
        _building_id: &str,
        room_id: &str,
        _capacity: f64,
        _claims: &str,
    ) {
        self.seeded_rooms.lock().unwrap().push(room_id.to_string());
    }

    async fn notify_provisioning_failed(&self, building_id: &str, error: &str) {
        self.failure_notifications
            .lock()
            .unwrap()
            .push((building_id.to_string(), error.to_string()));
    }
}

#[derive(Default)]
pub struct FakeEvents {
    pub published: Mutex<Vec<Building>>,
    pub refuse: bool,
}

#[async_trait]
impl RegistrationEvents for FakeEvents {
    async fn publish_building_registration_request(
        &self,
        building: &Building,
    ) -> anyhow::Result<()> {
        if self.refuse {
            anyhow::bail!("kafka said no");
        }
        self.published.lock().unwrap().push(building.clone());
        Ok(())
    }
}
