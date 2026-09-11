use crate::kernel::ports::BuildingStore;
use crate::types::building::{BuildingNames, RegisteredBuilding};
use async_trait::async_trait;
use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(300);

/// Caches `names_of`, read on every breach for text that only a re-registration changes.
///
/// Upserts go through the same instance and drop the entry at once; the TTL covers other replicas.
pub struct CachedBuildings {
    inner: Arc<dyn BuildingStore>,
    names: DashMap<String, (Instant, BuildingNames)>,
}

impl CachedBuildings {
    pub fn new(inner: Arc<dyn BuildingStore>) -> Self {
        Self {
            inner,
            names: DashMap::new(),
        }
    }

    fn cached(&self, building_id: &str) -> Option<BuildingNames> {
        let entry = self.names.get(building_id)?;
        let (stored_at, names) = entry.value();
        (stored_at.elapsed() < TTL).then(|| names.clone())
    }
}

#[async_trait]
impl BuildingStore for CachedBuildings {
    async fn upsert(&self, building: &RegisteredBuilding) -> anyhow::Result<()> {
        self.inner.upsert(building).await?;
        self.names.remove(&building.id);
        Ok(())
    }

    // An unregistered building is not cached, so memory stays bounded by registered buildings.
    async fn names_of(&self, building_id: &str) -> anyhow::Result<Option<BuildingNames>> {
        if let Some(names) = self.cached(building_id) {
            return Ok(Some(names));
        }
        let names = self.inner.names_of(building_id).await?;
        if let Some(found) = &names {
            self.names
                .insert(building_id.to_owned(), (Instant::now(), found.clone()));
        }
        Ok(names)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::FakeBuildings;
    use crate::types::building::Room;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct Counting {
        buildings: FakeBuildings,
        lookups: AtomicUsize,
    }

    #[async_trait]
    impl BuildingStore for Counting {
        async fn upsert(&self, building: &RegisteredBuilding) -> anyhow::Result<()> {
            self.buildings.upsert(building).await
        }

        async fn names_of(&self, building_id: &str) -> anyhow::Result<Option<BuildingNames>> {
            self.lookups.fetch_add(1, Ordering::SeqCst);
            self.buildings.names_of(building_id).await
        }
    }

    fn hq(name: &str) -> RegisteredBuilding {
        RegisteredBuilding {
            id: "b1".to_owned(),
            name: name.to_owned(),
            rooms: vec![Room {
                id: "r1".to_owned(),
                name: "Lab 1".to_owned(),
            }],
        }
    }

    fn cached_over(inner: &Arc<Counting>) -> CachedBuildings {
        CachedBuildings::new(inner.clone() as Arc<dyn BuildingStore>)
    }

    #[tokio::test]
    async fn a_second_lookup_is_served_from_the_cache() {
        let inner = Arc::new(Counting::default());
        let cache = cached_over(&inner);
        cache.upsert(&hq("HQ")).await.unwrap();

        cache.names_of("b1").await.unwrap();
        let names = cache.names_of("b1").await.unwrap().unwrap();

        assert_eq!(names.name, "HQ");
        assert_eq!(inner.lookups.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_re_registration_through_the_cache_is_seen_at_once() {
        let inner = Arc::new(Counting::default());
        let cache = cached_over(&inner);
        cache.upsert(&hq("HQ")).await.unwrap();
        cache.names_of("b1").await.unwrap();

        cache.upsert(&hq("Head Office")).await.unwrap();

        assert_eq!(
            cache.names_of("b1").await.unwrap().unwrap().name,
            "Head Office"
        );
    }

    #[tokio::test]
    async fn an_unregistered_building_is_looked_up_again_rather_than_cached() {
        let inner = Arc::new(Counting::default());
        let cache = cached_over(&inner);

        assert!(cache.names_of("nowhere").await.unwrap().is_none());
        assert!(cache.names_of("nowhere").await.unwrap().is_none());

        assert_eq!(inner.lookups.load(Ordering::SeqCst), 2);
    }
}
