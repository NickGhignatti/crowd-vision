use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use uuid::Uuid;

use crate::domain::identity::GatewayClaims;
use crate::domain::{Building, DomainError, Room, normalize_building_name, normalize_room_name};
use crate::service::authz;
use crate::service::ports::{BuildingStore, DownstreamSync};

const MAX_DOMAIN_NAMES: usize = 500;

#[derive(Debug, Default, Clone)]
pub struct RoomPatch {
    pub name: Option<String>,
    pub color: Option<String>,
    pub capacity: Option<f64>,
    pub position: Option<crate::domain::Coordinates>,
    pub dimensions: Option<crate::domain::Dimensions>,
}

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
        self.load(id).await
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
            backfilled.push(self.backfill_names(building).await?);
        }
        Ok(backfilled)
    }

    pub async fn counts(
        &self,
        requested: &[String],
        claims: &GatewayClaims,
    ) -> Result<HashMap<String, i64>, DomainError> {
        if requested.len() > MAX_DOMAIN_NAMES {
            return Err(DomainError::Validation(format!(
                "Too many domains requested (max {MAX_DOMAIN_NAMES})"
            )));
        }
        let scoped = authz::scope_to_memberships(requested, claims);
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
        let mut building = self.load_for_edit(id, claims).await?;

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

    pub async fn create_room(
        &self,
        building_id: &str,
        room: Room,
        claims: &GatewayClaims,
    ) -> Result<Room, DomainError> {
        let mut building = self.load_for_edit(building_id, claims).await?;

        let room = Room {
            id: Uuid::new_v4().to_string(),
            ..room
        };
        let room = Room {
            name: normalize_room_name(Some(&room.name), &room.id),
            ..room
        };

        building.rooms.push(room.clone());
        self.store.upsert(&building).await?;
        self.downstream
            .clone_thresholds(&building, None, &claims.raw)
            .await?;
        self.downstream
            .init_room_thresholds(building_id, &room.id, room.capacity, &claims.raw)
            .await;

        Ok(room)
    }

    pub async fn update_room(
        &self,
        building_id: &str,
        room_id: &str,
        patch: RoomPatch,
        claims: &GatewayClaims,
    ) -> Result<Room, DomainError> {
        let mut building = self.load_for_edit(building_id, claims).await?;

        let room = building
            .rooms
            .iter_mut()
            .find(|r| r.id == room_id)
            .ok_or_else(|| missing_room(building_id, room_id))?;

        if let Some(name) = patch.name {
            room.name = name;
        }
        if let Some(color) = patch.color {
            room.color = Some(color);
        }
        if let Some(capacity) = patch.capacity {
            room.capacity = capacity;
        }
        if let Some(position) = patch.position {
            room.position = position;
        }
        if let Some(dimensions) = patch.dimensions {
            room.dimensions = dimensions;
        }
        let updated = room.clone();

        self.store.upsert(&building).await?;
        self.downstream
            .clone_thresholds(&building, None, &claims.raw)
            .await?;

        Ok(updated)
    }

    pub async fn delete_room(
        &self,
        building_id: &str,
        room_id: &str,
        claims: &GatewayClaims,
    ) -> Result<(), DomainError> {
        let mut building = self.load_for_edit(building_id, claims).await?;

        if !building.rooms.iter().any(|r| r.id == room_id) {
            return Err(missing_room(building_id, room_id));
        }
        if building.rooms.len() == 1 {
            return Err(DomainError::Validation(
                "Cannot delete the last room in a building".to_string(),
            ));
        }

        building.rooms.retain(|r| r.id != room_id);
        self.store.upsert(&building).await?;
        self.downstream
            .clone_thresholds(&building, None, &claims.raw)
            .await?;

        Ok(())
    }

    pub async fn replace_rooms(
        &self,
        building_id: &str,
        rooms: Vec<Room>,
        claims: &GatewayClaims,
    ) -> Result<Building, DomainError> {
        let mut building = self.load_for_edit(building_id, claims).await?;

        if rooms.is_empty() {
            return Err(DomainError::Validation(
                "'rooms' must be a non-empty array".to_string(),
            ));
        }

        let mut seen = HashSet::with_capacity(rooms.len());
        for room in &rooms {
            let id = room.id.trim();
            if id.is_empty() {
                return Err(DomainError::Validation(
                    "Every room must have a non-empty 'id'".to_string(),
                ));
            }
            if !seen.insert(id.to_string()) {
                return Err(DomainError::Validation(format!(
                    "Duplicate room id \"{id}\""
                )));
            }
        }

        let previous: HashSet<&str> = building.rooms.iter().map(|r| r.id.as_str()).collect();
        let added: Vec<Room> = rooms
            .iter()
            .filter(|r| !previous.contains(r.id.as_str()))
            .cloned()
            .collect();

        building.rooms = rooms;
        self.store.upsert(&building).await?;
        self.downstream
            .clone_thresholds(&building, None, &claims.raw)
            .await?;

        for room in &added {
            self.downstream
                .init_room_thresholds(building_id, &room.id, room.capacity, &claims.raw)
                .await;
        }

        Ok(building)
    }

    async fn load(&self, id: &str) -> Result<Building, DomainError> {
        let building = self.store.find_by_id(id).await?.ok_or_else(|| {
            DomainError::NotFound(format!("Building with id: \"{id}\" not found"))
        })?;
        self.backfill_names(building).await
    }

    async fn load_for_edit(
        &self,
        id: &str,
        claims: &GatewayClaims,
    ) -> Result<Building, DomainError> {
        let building = self.load(id).await?;
        if !authz::can_edit_domains(claims, &building.domains) {
            return Err(DomainError::Forbidden(
                "Requires an editing role in one of this building's domains".to_string(),
            ));
        }
        Ok(building)
    }

    async fn backfill_names(&self, mut building: Building) -> Result<Building, DomainError> {
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

fn missing_room(building_id: &str, room_id: &str) -> DomainError {
    DomainError::NotFound(format!(
        "Room with id \"{room_id}\" in the building \"{building_id}\" not found"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Coordinates, Dimensions};
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
            .counts(&["eng".to_string(), "secret".to_string()], &claims)
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
            buildings.counts(&many, &claims).await,
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
            buildings.delete_room("b1", "r1", &customer).await,
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
    async fn creating_a_room_ignores_any_client_chosen_id() {
        let (buildings, store, sync) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        let created = buildings
            .create_room("b1", room("client-chosen"), &admin)
            .await
            .unwrap();

        assert_ne!(created.id, "client-chosen");
        assert_eq!(store.get("b1").unwrap().rooms.len(), 2);
        assert_eq!(
            *sync.seeded_rooms.lock().unwrap(),
            std::slice::from_ref(&created.id)
        );
    }

    #[tokio::test]
    async fn updating_an_unknown_room_is_not_found() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        assert!(matches!(
            buildings
                .update_room("b1", "nope", RoomPatch::default(), &admin)
                .await,
            Err(DomainError::NotFound(_))
        ));
    }

    #[tokio::test]
    async fn updating_a_room_applies_only_the_fields_given() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        buildings
            .update_room(
                "b1",
                "r1",
                RoomPatch {
                    capacity: Some(50.0),
                    ..RoomPatch::default()
                },
                &admin,
            )
            .await
            .unwrap();

        let saved = &store.get("b1").unwrap().rooms[0];
        assert_eq!(saved.capacity, 50.0);
        assert_eq!(saved.name, "r1", "an omitted field must be left alone");
    }

    #[tokio::test]
    async fn deleting_the_last_room_is_refused() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        assert!(matches!(
            buildings.delete_room("b1", "r1", &admin).await,
            Err(DomainError::Validation(_))
        ));
        assert_eq!(store.get("b1").unwrap().rooms.len(), 1);
    }

    #[tokio::test]
    async fn replacing_rooms_refuses_duplicate_ids_without_writing() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        let result = buildings
            .replace_rooms("b1", vec![room("dup"), room("dup")], &admin)
            .await;

        assert!(matches!(result, Err(DomainError::Validation(_))));
        assert_eq!(
            store.get("b1").unwrap().rooms[0].id,
            "r1",
            "a refused bulk save must not partially apply"
        );
    }

    #[tokio::test]
    async fn replacing_rooms_seeds_thresholds_only_for_new_rooms() {
        let (buildings, store, sync) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        buildings
            .replace_rooms("b1", vec![room("r1"), room("r2")], &admin)
            .await
            .unwrap();

        assert_eq!(
            *sync.seeded_rooms.lock().unwrap(),
            ["r2"],
            "r1 already existed, so it must not be re-seeded"
        );
    }

    #[tokio::test]
    async fn replacing_rooms_refuses_an_empty_array() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        assert!(matches!(
            buildings.replace_rooms("b1", vec![], &admin).await,
            Err(DomainError::Validation(_))
        ));
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
            .update_room(
                "b1",
                "r1",
                RoomPatch {
                    capacity: Some(5.0),
                    ..RoomPatch::default()
                },
                &admin,
            )
            .await;

        assert!(matches!(result, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn geometry_survives_a_round_trip_through_the_store() {
        let (buildings, store, _) = buildings();
        seeded(&store, vec!["eng"]);
        let admin = claims_with(vec![("eng", "business_admin")]);

        buildings
            .update_room(
                "b1",
                "r1",
                RoomPatch {
                    position: Some(Coordinates {
                        x: 1.5,
                        y: 2.5,
                        z: 3.5,
                    }),
                    dimensions: Some(Dimensions {
                        width: 4.0,
                        height: 5.0,
                        depth: 6.0,
                    }),
                    ..RoomPatch::default()
                },
                &admin,
            )
            .await
            .unwrap();

        let saved = &store.get("b1").unwrap().rooms[0];
        assert_eq!(saved.position.x, 1.5);
        assert_eq!(saved.dimensions.depth, 6.0);
    }
}
