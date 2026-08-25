use std::collections::HashMap;
use std::sync::Arc;

use crate::domain::identity::GatewayClaims;
use crate::domain::{Building, DomainError, normalize_building_name, normalize_room_name};
use crate::service::authz;
use crate::service::ports::{BuildingStore, DownstreamSync};

const MAX_DOMAIN_NAMES: usize = 500;

#[derive(Debug, Default, Clone)]
pub struct BuildingPatch {
    pub name: Option<String>,
    pub domains: Option<Vec<String>>,
    pub max_temperature: Option<f64>,
}

pub struct Buildings {
    store: Arc<dyn BuildingStore>,
    downstream: Arc<dyn DownstreamSync>,
}

impl Buildings {
    pub fn new(store: Arc<dyn BuildingStore>, downstream: Arc<dyn DownstreamSync>) -> Self {
        Self { store, downstream }
    }

    pub async fn get(&self, id: &str) -> Result<Building, DomainError> {
        self.get_building_by_id(id).await
    }

    pub async fn list_for_domain(
        &self,
        domain: &str,
        claims: &GatewayClaims,
    ) -> Result<Vec<Building>, DomainError> {
        if !authz::is_member_of(claims, domain) {
            return Err(DomainError::Forbidden(
                "Not a member of this domain".to_string(),
            ));
        }
        let buildings = self.store.find_by_domain(domain).await?;
        let mut backfilled = Vec::with_capacity(buildings.len());
        for building in buildings {
            backfilled.push(self.normalize(building).await?);
        }
        Ok(backfilled)
    }

    pub async fn counts_per_domain(
        &self,
        requested: &[String],
        claims: &GatewayClaims,
    ) -> Result<HashMap<String, i64>, DomainError> {
        if requested.len() > MAX_DOMAIN_NAMES {
            return Err(DomainError::Validation(format!(
                "Too many domains requested (max {MAX_DOMAIN_NAMES})"
            )));
        }
        let scoped = authz::filter_readable_domains_from_memberships(requested, claims);
        Ok(self.store.counts_by_domain(&scoped).await?)
    }

    pub async fn domains_of(&self, building: &str) -> Result<Vec<String>, DomainError> {
        Ok(match self.store.find_by_id(building).await? {
            Some(found) => found.domains,
            None => self
                .store
                .find_by_name(building)
                .await?
                .into_iter()
                .flat_map(|b| b.domains)
                .collect(),
        })
    }

    pub async fn update(
        &self,
        id: &str,
        patch: BuildingPatch,
        claims: &GatewayClaims,
    ) -> Result<Building, DomainError> {
        let mut building = self.get_building_by_id_for_edit(id, claims).await?;

        if let Some(name) = patch.name {
            building.name = name;
        }
        if let Some(domains) = patch.domains {
            building.domains = domains;
        }
        self.store.upsert(&building).await?;
        self.downstream
            .clone_thresholds(&building, patch.max_temperature, &claims.raw)
            .await?;

        Ok(building)
    }

    async fn get_building_by_id(&self, id: &str) -> Result<Building, DomainError> {
        let building = self.store.find_by_id(id).await?.ok_or_else(|| {
            DomainError::NotFound(format!("Building with id: \"{id}\" not found"))
        })?;
        self.normalize(building).await
    }

    async fn get_building_by_id_for_edit(
        &self,
        id: &str,
        claims: &GatewayClaims,
    ) -> Result<Building, DomainError> {
        let building = self.get_building_by_id(id).await?;
        if !authz::can_edit_domains(claims, &building.domains) {
            return Err(DomainError::Forbidden(
                "Requires an editing role in one of this building's domains".to_string(),
            ));
        }
        Ok(building)
    }

    async fn normalize(&self, mut building: Building) -> Result<Building, DomainError> {
        let mut changed = false;

        let normalized = normalize_building_name(Some(&building.name), Some(&building.id));
        if normalized != building.name {
            building.name = normalized;
            changed = true;
        }
        for room in &mut building.rooms {
            let normalized = normalize_room_name(Some(&room.name), &room.id);
            if normalized != room.name {
                room.name = normalized;
                changed = true;
            }
        }

        if changed {
            self.store.upsert(&building).await?;
        }
        Ok(building)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::fakes::{FakeStore, FakeSync, claims_with, room};

    fn buildings() -> (Buildings, Arc<FakeStore>, Arc<FakeSync>) {
        let store = Arc::new(FakeStore::default());
        let sync = Arc::new(FakeSync::default());
        (Buildings::new(store.clone(), sync.clone()), store, sync)
    }

    fn seeded(store: &FakeStore, domains: Vec<&str>) -> Building {
        let building = Building {
            id: "b1".to_string(),
            name: "Engineering Block".to_string(),
            rooms: vec![room("r1")],
            domains: domains.into_iter().map(str::to_string).collect(),
        };
        store.seed(building.clone());
        building
    }

    #[tokio::test]
    async fn getting_an_unknown_building_is_not_found() {
        let (buildings, _, _) = buildings();

        assert!(matches!(
            buildings.get("nope").await,
            Err(DomainError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn loading_heals_a_blank_name_and_persists_the_fix() {
        let (buildings, store, _) = buildings();
        store.seed(Building {
            id: "b1".to_string(),
            name: "   ".to_string(),
            rooms: vec![room("r1")],
            domains: vec!["eng".to_string()],
        });

        let loaded = buildings.get("b1").await.unwrap();

        assert_eq!(loaded.name, "b1", "a blank name falls back to the id");
        assert_eq!(
            store.get("b1").unwrap().name,
            "b1",
            "the healed name must be written back, not just returned"
        );
    }

    #[tokio::test]
    async fn listing_a_domain_the_caller_is_not_in_is_forbidden() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let outsider = claims_with(vec![("other", "business_admin")]);

        assert!(matches!(
            buildings.list_for_domain("eng", &outsider).await,
            Err(DomainError::Forbidden(_))
        ));
    }

    #[tokio::test]
    async fn counts_drop_domains_the_caller_cannot_read() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let claims = claims_with(vec![("eng", "standard_customer")]);

        let counts = buildings
            .counts_per_domain(&["eng".to_string(), "secret".to_string()], &claims)
            .await
            .unwrap();

        assert_eq!(counts.get("eng"), Some(&1));
        assert_eq!(counts.get("secret"), None);
    }

    #[tokio::test]
    async fn counts_refuse_an_oversized_request() {
        let (buildings, _, _) = buildings();
        let claims = claims_with(vec![("eng", "standard_customer")]);
        let many: Vec<String> = (0..=MAX_DOMAIN_NAMES).map(|i| format!("d-{i}")).collect();

        assert!(matches!(
            buildings.counts_per_domain(&many, &claims).await,
            Err(DomainError::Validation(_))
        ));
    }

    #[tokio::test]
    async fn domains_of_falls_back_from_id_to_name() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);

        assert_eq!(buildings.domains_of("b1").await.unwrap(), ["eng"]);
        assert_eq!(
            buildings.domains_of("Engineering Block").await.unwrap(),
            ["eng"],
            "the alert path only knows the name"
        );
        assert!(buildings.domains_of("nothing").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn editing_requires_a_role_in_one_of_the_buildings_own_domains() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let elsewhere = claims_with(vec![("other", "business_admin")]);

        let result = buildings
            .update(
                "b1",
                BuildingPatch {
                    name: Some("Renamed".to_string()),
                    ..BuildingPatch::default()
                },
                &elsewhere,
            )
            .await;

        assert!(matches!(result, Err(DomainError::Forbidden(_))));
        assert_eq!(
            store.get("b1").unwrap().name,
            "Engineering Block",
            "a refused edit must not have been written"
        );
    }

    #[tokio::test]
    async fn a_read_only_member_cannot_edit() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let customer = claims_with(vec![("eng", "standard_customer")]);

        assert!(matches!(
            buildings
                .update(
                    "b1",
                    BuildingPatch {
                        name: Some("Renamed".to_string()),
                        ..BuildingPatch::default()
                    },
                    &customer,
                )
                .await,
            Err(DomainError::Forbidden(_))
        ));
    }

    #[tokio::test]
    async fn updating_a_building_saves_it_and_tells_downstream() {
        let (buildings, store, sync) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        let updated = buildings
            .update(
                "b1",
                BuildingPatch {
                    name: Some("Renamed".to_string()),
                    max_temperature: Some(24.0),
                    ..BuildingPatch::default()
                },
                &admin,
            )
            .await
            .unwrap();

        assert_eq!(updated.name, "Renamed");
        assert_eq!(store.get("b1").unwrap().name, "Renamed");
        assert_eq!(
            *sync.cloned.lock().unwrap(),
            [("b1".to_string(), Some(24.0))]
        );
    }

    #[tokio::test]
    async fn a_refused_clone_fails_the_edit() {
        let store = Arc::new(FakeStore::default());
        let sync = Arc::new(FakeSync {
            refuse: true,
            ..FakeSync::default()
        });
        let buildings = Buildings::new(store.clone(), sync.clone());
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        let result = buildings
            .update(
                "b1",
                BuildingPatch {
                    name: Some("Renamed".to_string()),
                    ..BuildingPatch::default()
                },
                &admin,
            )
            .await;

        assert!(matches!(result, Err(DomainError::Internal(_))));
    }
}
