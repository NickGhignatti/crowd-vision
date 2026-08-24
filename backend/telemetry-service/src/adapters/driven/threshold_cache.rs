use crate::contracts::threshold::{Bounds, TemperatureLimits};
use crate::kernel::ports::ThresholdStore;
use async_trait::async_trait;
use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(60);
const MAX_ENTRIES: usize = 10_000;

type Key = (String, String, String);

/// Caches `resolve`, the only threshold read on the ingest hot path — a
/// database round trip per tick for an answer that changes on admin action.
///
/// Writes go through the same instance, so an upsert invalidates immediately
/// and the TTL only has to cover staleness against *other* replicas.
pub struct CachedThresholds {
    inner: Arc<dyn ThresholdStore>,
    resolved: DashMap<Key, (Instant, Option<Bounds>)>,
    capacity: usize,
}

impl CachedThresholds {
    pub fn new(inner: Arc<dyn ThresholdStore>) -> Self {
        Self::with_capacity(inner, MAX_ENTRIES)
    }

    fn with_capacity(inner: Arc<dyn ThresholdStore>, capacity: usize) -> Self {
        Self {
            inner,
            resolved: DashMap::new(),
            capacity,
        }
    }

    fn cached(&self, key: &Key) -> Option<Option<Bounds>> {
        let entry = self.resolved.get(key)?;
        let (stored_at, bounds) = entry.value();
        (stored_at.elapsed() < TTL).then(|| bounds.clone())
    }

    /// Bounded by entry count, not by how many rooms exist. Once the live set
    /// fills the cache the overflow simply goes uncached, which costs a query
    /// rather than unbounded memory.
    fn remember(&self, key: Key, bounds: Option<Bounds>) {
        if self.resolved.len() >= self.capacity {
            self.resolved
                .retain(|_, (stored_at, _)| stored_at.elapsed() < TTL);
        }
        if self.resolved.len() >= self.capacity {
            return;
        }
        self.resolved.insert(key, (Instant::now(), bounds));
    }

    /// A building-level row is the fallback for every room of that building
    /// (see the `room_id is null` arm of the resolve query), so one upsert can
    /// change any room's answer. Dropping the whole building+metric set is the
    /// only invalidation that is correct for both cases.
    fn invalidate(&self, building_id: &str, metric: &str) {
        self.resolved.retain(|(building, cached_metric, _), _| {
            building != building_id || cached_metric != metric
        });
    }
}

#[async_trait]
impl ThresholdStore for CachedThresholds {
    async fn resolve(
        &self,
        building_id: &str,
        keys: &[(&str, &str)],
    ) -> anyhow::Result<Vec<Option<Bounds>>> {
        let mut answers: Vec<Option<Option<Bounds>>> = keys
            .iter()
            .map(|(metric, room_id)| {
                self.cached(&(
                    building_id.to_owned(),
                    (*metric).to_owned(),
                    (*room_id).to_owned(),
                ))
            })
            .collect();

        let missing: Vec<(usize, (&str, &str))> = answers
            .iter()
            .enumerate()
            .filter(|(_, answer)| answer.is_none())
            .map(|(index, _)| (index, keys[index]))
            .collect();
        if !missing.is_empty() {
            let asked: Vec<(&str, &str)> = missing.iter().map(|(_, key)| *key).collect();
            let fetched = self.inner.resolve(building_id, &asked).await?;
            for ((index, (metric, room_id)), bounds) in missing.into_iter().zip(fetched) {
                self.remember(
                    (
                        building_id.to_owned(),
                        metric.to_owned(),
                        room_id.to_owned(),
                    ),
                    bounds.clone(),
                );
                answers[index] = Some(bounds);
            }
        }

        Ok(answers.into_iter().map(Option::flatten).collect())
    }

    async fn building_bounds(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Option<Bounds>> {
        self.inner.building_bounds(building_id, metric).await
    }

    async fn upsert(
        &self,
        building_id: &str,
        room_id: Option<&str>,
        metric: &str,
        patch: &Bounds,
    ) -> anyhow::Result<Bounds> {
        let merged = self.inner.upsert(building_id, room_id, metric, patch).await;
        self.invalidate(building_id, metric);
        merged
    }

    async fn temperature_limits(
        &self,
        building_id: &str,
    ) -> anyhow::Result<Option<TemperatureLimits>> {
        self.inner.temperature_limits(building_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct CountingStore {
        calls: AtomicUsize,
        resolves: AtomicUsize,
        upserts: AtomicUsize,
    }

    impl CountingStore {
        fn resolve_count(&self) -> usize {
            self.resolves.load(Ordering::SeqCst)
        }

        fn call_count(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    fn bounds(max: f64) -> Bounds {
        json!({ "maxTemp": max }).as_object().cloned().unwrap()
    }

    #[async_trait]
    impl ThresholdStore for CountingStore {
        async fn resolve(
            &self,
            _: &str,
            keys: &[(&str, &str)],
        ) -> anyhow::Result<Vec<Option<Bounds>>> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.resolves.fetch_add(keys.len(), Ordering::SeqCst);
            Ok(keys.iter().map(|_| Some(bounds(25.0))).collect())
        }

        async fn building_bounds(&self, _: &str, _: &str) -> anyhow::Result<Option<Bounds>> {
            Ok(None)
        }

        async fn upsert(
            &self,
            _: &str,
            _: Option<&str>,
            _: &str,
            patch: &Bounds,
        ) -> anyhow::Result<Bounds> {
            self.upserts.fetch_add(1, Ordering::SeqCst);
            Ok(patch.clone())
        }

        async fn temperature_limits(&self, _: &str) -> anyhow::Result<Option<TemperatureLimits>> {
            Ok(None)
        }
    }

    async fn resolve(
        cache: &CachedThresholds,
        building_id: &str,
        metric: &str,
        room_id: &str,
    ) -> Option<Bounds> {
        cache
            .resolve(building_id, &[(metric, room_id)])
            .await
            .unwrap()
            .into_iter()
            .next()
            .flatten()
    }

    fn cache(capacity: usize) -> (CachedThresholds, Arc<CountingStore>) {
        let inner = Arc::new(CountingStore::default());
        (
            CachedThresholds::with_capacity(inner.clone(), capacity),
            inner,
        )
    }

    #[tokio::test]
    async fn a_repeated_resolve_asks_the_database_once() {
        let (cache, inner) = cache(MAX_ENTRIES);

        for _ in 0..10 {
            resolve(&cache, "b1", "temperature", "r1").await;
        }

        assert_eq!(inner.resolve_count(), 1);
    }

    #[tokio::test]
    async fn a_whole_tick_asks_the_database_once() {
        let (cache, inner) = cache(MAX_ENTRIES);
        let keys: Vec<(&str, &str)> = vec![
            ("temperature", "r1"),
            ("temperature", "r2"),
            ("peopleCount", "r3"),
        ];

        let bounds = cache.resolve("b1", &keys).await.unwrap();

        assert_eq!(bounds.len(), 3);
        assert_eq!(inner.call_count(), 1, "one tick is one round trip");
        assert_eq!(inner.resolve_count(), 3);
    }

    #[tokio::test]
    async fn a_tick_asks_only_for_the_rooms_it_has_not_cached() {
        let (cache, inner) = cache(MAX_ENTRIES);
        resolve(&cache, "b1", "temperature", "r1").await;

        cache
            .resolve("b1", &[("temperature", "r1"), ("temperature", "r2")])
            .await
            .unwrap();

        assert_eq!(inner.call_count(), 2);
        assert_eq!(inner.resolve_count(), 2, "r1 came from the cache");
    }

    #[tokio::test]
    async fn distinct_rooms_are_cached_separately() {
        let (cache, inner) = cache(MAX_ENTRIES);

        resolve(&cache, "b1", "temperature", "r1").await;
        resolve(&cache, "b1", "temperature", "r2").await;
        resolve(&cache, "b1", "temperature", "r1").await;

        assert_eq!(inner.resolve_count(), 2);
    }

    #[tokio::test]
    async fn an_upsert_invalidates_every_room_of_that_building_and_metric() {
        let (cache, inner) = cache(MAX_ENTRIES);
        resolve(&cache, "b1", "temperature", "r1").await;
        resolve(&cache, "b1", "temperature", "r2").await;
        assert_eq!(inner.resolve_count(), 2);

        // Building-level write: no room named, yet both rooms must re-resolve.
        cache
            .upsert("b1", None, "temperature", &bounds(30.0))
            .await
            .unwrap();

        resolve(&cache, "b1", "temperature", "r1").await;
        resolve(&cache, "b1", "temperature", "r2").await;
        assert_eq!(inner.resolve_count(), 4);
    }

    #[tokio::test]
    async fn an_upsert_leaves_other_buildings_and_metrics_cached() {
        let (cache, inner) = cache(MAX_ENTRIES);
        resolve(&cache, "b1", "temperature", "r1").await;
        resolve(&cache, "b2", "temperature", "r1").await;
        resolve(&cache, "b1", "peopleCount", "r1").await;

        cache
            .upsert("b1", Some("r1"), "temperature", &bounds(30.0))
            .await
            .unwrap();

        resolve(&cache, "b2", "temperature", "r1").await;
        resolve(&cache, "b1", "peopleCount", "r1").await;
        assert_eq!(inner.resolve_count(), 3);
    }

    #[tokio::test]
    async fn the_cache_never_grows_past_its_capacity() {
        let (cache, _) = cache(4);

        for room in 0..50 {
            resolve(&cache, "b1", "temperature", &format!("r{room}")).await;
        }

        assert!(cache.resolved.len() <= 4);
    }

    #[tokio::test]
    async fn an_uncacheable_overflow_still_answers_correctly() {
        let (cache, _) = cache(1);

        let first = resolve(&cache, "b1", "temperature", "r1").await;
        let overflow = resolve(&cache, "b1", "temperature", "r2").await;

        assert_eq!(first, Some(bounds(25.0)));
        assert_eq!(overflow, Some(bounds(25.0)));
    }
}
