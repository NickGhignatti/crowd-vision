use std::sync::Arc;

use crate::domain::identity::GatewayClaims;
use crate::domain::{Building, DomainError, Placement, PlacementChanges};
use crate::service::authz;
use crate::service::ports::{BuildingStore, PlacementStore};

pub struct Placements {
    buildings: Arc<dyn BuildingStore>,
    store: Arc<dyn PlacementStore>,
}

impl Placements {
    pub fn new(buildings: Arc<dyn BuildingStore>, store: Arc<dyn PlacementStore>) -> Self {
        Self { buildings, store }
    }

    pub async fn list(
        &self,
        building_id: &str,
        claims: &GatewayClaims,
    ) -> Result<Vec<Placement>, DomainError> {
        let building = self.building(building_id).await?;
        if !building
            .domains
            .iter()
            .any(|domain| authz::is_member_of(claims, domain))
        {
            return Err(DomainError::Forbidden(
                "Requires membership in one of this building's domains".to_string(),
            ));
        }
        let mut placements = self.store.load(building_id).await?;
        placements.sort_by(|a, b| a.sensor_id.cmp(&b.sensor_id));
        Ok(placements)
    }

    pub async fn apply(
        &self,
        building_id: &str,
        changes: PlacementChanges,
        claims: &GatewayClaims,
    ) -> Result<(), DomainError> {
        let building = self.building(building_id).await?;
        if !authz::can_edit_domains(claims, &building.domains) {
            return Err(DomainError::Forbidden(
                "Requires an editing role in one of this building's domains".to_string(),
            ));
        }
        Ok(self.store.apply(building_id, &changes).await?)
    }

    async fn building(&self, building_id: &str) -> Result<Building, DomainError> {
        self.buildings
            .find_by_id(building_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound(format!("Building with id: \"{building_id}\" not found"))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Coordinates;
    use crate::service::fakes::{FakePlacements, FakeStore, claims_with, room};

    fn placements() -> (Placements, Arc<FakeStore>, Arc<FakePlacements>) {
        let buildings = Arc::new(FakeStore::default());
        let store = Arc::new(FakePlacements::default());
        (
            Placements::new(buildings.clone(), store.clone()),
            buildings,
            store,
        )
    }

    fn seeded(store: &FakeStore) {
        store.seed(Building {
            id: "b1".to_string(),
            name: "Engineering Block".to_string(),
            rooms: vec![room("r1")],
            domains: vec!["eng".to_string()],
        });
    }

    fn placement(sensor_id: &str, x: f64) -> Placement {
        Placement {
            sensor_id: sensor_id.to_owned(),
            position: Coordinates { x, y: 0.0, z: 0.0 },
        }
    }

    fn upserting(placements: Vec<Placement>) -> PlacementChanges {
        PlacementChanges::checked(placements, Vec::new()).unwrap()
    }

    fn staff() -> GatewayClaims {
        claims_with(vec![("eng", "business_staff")])
    }

    fn customer() -> GatewayClaims {
        claims_with(vec![("eng", "standard_customer")])
    }

    fn outsider() -> GatewayClaims {
        claims_with(vec![("other", "business_admin")])
    }

    #[tokio::test]
    async fn a_saved_placement_is_listed_back() {
        let (service, buildings, _) = placements();
        seeded(&buildings);

        service
            .apply("b1", upserting(vec![placement("s1", 1.0)]), &staff())
            .await
            .unwrap();

        let listed = service.list("b1", &customer()).await.unwrap();
        assert_eq!(listed, vec![placement("s1", 1.0)]);
    }

    #[tokio::test]
    async fn an_upsert_moves_a_placement_it_already_has() {
        let (service, buildings, _) = placements();
        seeded(&buildings);

        for x in [1.0, 4.5] {
            service
                .apply("b1", upserting(vec![placement("s1", x)]), &staff())
                .await
                .unwrap();
        }

        assert_eq!(
            service.list("b1", &staff()).await.unwrap(),
            vec![placement("s1", 4.5)]
        );
    }

    #[tokio::test]
    async fn a_delete_removes_only_its_own_placement() {
        let (service, buildings, _) = placements();
        seeded(&buildings);
        service
            .apply(
                "b1",
                upserting(vec![placement("s1", 1.0), placement("s2", 2.0)]),
                &staff(),
            )
            .await
            .unwrap();

        service
            .apply(
                "b1",
                PlacementChanges::checked(Vec::new(), vec!["s1".to_owned()]).unwrap(),
                &staff(),
            )
            .await
            .unwrap();

        assert_eq!(
            service.list("b1", &staff()).await.unwrap(),
            vec![placement("s2", 2.0)]
        );
    }

    #[tokio::test]
    async fn deleting_a_placement_that_is_not_there_changes_nothing() {
        let (service, buildings, _) = placements();
        seeded(&buildings);

        service
            .apply(
                "b1",
                PlacementChanges::checked(Vec::new(), vec!["ghost".to_owned()]).unwrap(),
                &staff(),
            )
            .await
            .unwrap();

        assert!(service.list("b1", &staff()).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn saving_requires_an_editing_role_in_the_buildings_domains() {
        let (service, buildings, store) = placements();
        seeded(&buildings);

        for claims in [customer(), outsider()] {
            let error = service
                .apply("b1", upserting(vec![placement("s1", 1.0)]), &claims)
                .await
                .unwrap_err();
            assert!(matches!(error, DomainError::Forbidden(_)));
        }
        assert!(store.saved.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn listing_requires_membership_in_one_of_the_buildings_domains() {
        let (service, buildings, _) = placements();
        seeded(&buildings);

        let error = service.list("b1", &outsider()).await.unwrap_err();
        assert!(matches!(error, DomainError::Forbidden(_)));
    }

    #[tokio::test]
    async fn an_unknown_building_is_not_found() {
        let (service, _, _) = placements();

        let error = service.list("b9", &staff()).await.unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));

        let error = service
            .apply("b9", upserting(vec![placement("s1", 1.0)]), &staff())
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
    }

    #[tokio::test]
    async fn a_store_failure_is_internal() {
        let (service, buildings, store) = placements();
        seeded(&buildings);
        store
            .refuse
            .store(true, std::sync::atomic::Ordering::Relaxed);

        let error = service
            .apply("b1", upserting(vec![placement("s1", 1.0)]), &staff())
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Internal(_)));
    }
}
