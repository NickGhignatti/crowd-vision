use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use twin_schema::{Device, Devices, WifiObservations};

use super::estimator::Geometry;
use super::ports::{BuildingStore, DevicesFeed, PlacementStore};
use super::tracks::Tracks;
use crate::domain::Placement;

/// Older than this a tick shows where people were, not where they are: three collector polls.
pub const MAX_TICK_AGE_MS: u64 = 30_000;
/// A router moved in the editor moves the dots within this long.
pub const GEOMETRY_TTL_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Observed {
    Accepted,
    Invalid,
    Stale,
}

impl Observed {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Invalid => "invalid",
            Self::Stale => "stale",
        }
    }
}

struct Snapshot {
    loaded_ms: u64,
    placements: Vec<Placement>,
    geometry: Option<Arc<Geometry>>,
}

#[derive(Default)]
struct Site {
    tick: u64,
    tracks: Tracks,
    dots: Vec<Device>,
}

/// Each building's tracks and dots, moved on by every fresh Wi-Fi tick. Nothing is stored.
pub struct Tracking {
    buildings: Arc<dyn BuildingStore>,
    placements: Arc<dyn PlacementStore>,
    feed: Arc<dyn DevicesFeed>,
    geometry: Mutex<HashMap<String, Snapshot>>,
    sites: Mutex<HashMap<String, Site>>,
}

impl Tracking {
    pub fn new(
        buildings: Arc<dyn BuildingStore>,
        placements: Arc<dyn PlacementStore>,
        feed: Arc<dyn DevicesFeed>,
    ) -> Self {
        Self {
            buildings,
            placements,
            feed,
            geometry: Mutex::default(),
            sites: Mutex::default(),
        }
    }

    /// Steps the building's tracks and publishes its dots, unless the tick breaks the contract, is
    /// too old, or is older than the one held. A building twin does not know gets no dots.
    pub async fn observe(&self, tick: WifiObservations, now_ms: u64) -> Observed {
        if !tick.problems().is_empty() {
            return Observed::Invalid;
        }
        if now_ms.saturating_sub(tick.tick) > MAX_TICK_AGE_MS {
            return Observed::Stale;
        }
        if self.held_tick(&tick.building_id) > Some(tick.tick) {
            return Observed::Stale;
        }

        let (geometry, moved) = self.geometry(&tick.building_id, now_ms).await;
        let devices = {
            let mut sites = self.sites.lock().expect("tracking lock");
            let site = sites.entry(tick.building_id.clone()).or_default();
            if moved {
                site.tracks = Tracks::default();
            }
            site.tick = tick.tick;
            site.dots =
                geometry.map_or_else(Vec::new, |geometry| site.tracks.step(&tick, &geometry));
            site.dots.clone()
        };
        self.feed
            .publish(&Devices {
                building_id: tick.building_id,
                tick: tick.tick,
                devices,
            })
            .await;
        Observed::Accepted
    }

    /// The building's dots from its newest tick; none once that tick is too old to be true.
    pub fn dots(&self, building_id: &str, now_ms: u64) -> Vec<Device> {
        self.sites
            .lock()
            .expect("tracking lock")
            .get(building_id)
            .filter(|site| now_ms.saturating_sub(site.tick) <= MAX_TICK_AGE_MS)
            .map(|site| site.dots.clone())
            .unwrap_or_default()
    }

    pub fn held_tick(&self, building_id: &str) -> Option<u64> {
        self.sites
            .lock()
            .expect("tracking lock")
            .get(building_id)
            .map(|site| site.tick)
    }

    /// The building's floor plan, reloaded once it is older than `GEOMETRY_TTL_MS`, and whether a
    /// router moved since: tracks built on the old plan would hold people where it put them.
    /// A failed reload keeps the last good plan: a database blip must not wipe every dot.
    async fn geometry(&self, building_id: &str, now_ms: u64) -> (Option<Arc<Geometry>>, bool) {
        if let Some(held) = self
            .geometry
            .lock()
            .expect("geometry lock")
            .get(building_id)
            && now_ms.saturating_sub(held.loaded_ms) < GEOMETRY_TTL_MS
        {
            return (held.geometry.clone(), false);
        }

        let loaded = async {
            let Some(building) = self.buildings.find_by_id(building_id).await? else {
                return anyhow::Ok(None);
            };
            let mut placements = self.placements.load(building_id).await?;
            placements.sort_by(|a, b| a.sensor_id.cmp(&b.sensor_id));
            Ok(Some((building, placements)))
        }
        .await;
        let mut held = self.geometry.lock().expect("geometry lock");
        match loaded {
            Ok(found) => {
                let placements = found.as_ref().map(|(_, p)| p.clone()).unwrap_or_default();
                let geometry = found
                    .map(|(building, placements)| Arc::new(Geometry::of(&building, &placements)));
                let moved = held
                    .get(building_id)
                    .is_some_and(|before| before.placements != placements);
                held.insert(
                    building_id.to_owned(),
                    Snapshot {
                        loaded_ms: now_ms,
                        placements,
                        geometry: geometry.clone(),
                    },
                );
                (geometry, moved)
            }
            Err(e) => {
                log::warn!("floor plan of {building_id} not reloaded: {e:?}");
                let kept = held
                    .get(building_id)
                    .and_then(|before| before.geometry.clone());
                (kept, false)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Coordinates;
    use crate::service::fakes::{FakeFeed, FakePlacements, FakeStore, sim_building, sim_routers};
    use std::sync::atomic::Ordering;
    use twin_schema::ConnectedPhone;

    const NOW: u64 = 1_761_300_000_000;

    struct Rig {
        tracking: Tracking,
        placements: Arc<FakePlacements>,
        feed: Arc<FakeFeed>,
    }

    fn rig() -> Rig {
        let store = Arc::new(FakeStore::default());
        let placements = Arc::new(FakePlacements::default());
        store.seed(sim_building());
        placements
            .saved
            .lock()
            .unwrap()
            .insert("b-est".to_owned(), sim_routers());
        let feed = Arc::new(FakeFeed::default());
        Rig {
            tracking: Tracking::new(store, placements.clone(), feed.clone()),
            placements,
            feed,
        }
    }

    fn tick(building: &str, at: u64) -> WifiObservations {
        WifiObservations {
            building_id: building.to_owned(),
            tick: at,
            answered: vec!["r-f0-10".to_owned()],
            connected: vec![ConnectedPhone {
                token: "7f3c9a01b2d4e6f8".to_owned(),
                router: "r-f0-10".to_owned(),
                signal: -50,
            }],
            bursts: vec![],
            devices_per_person: None,
        }
    }

    fn move_router(rig: &Rig, x: f64) {
        let mut routers = sim_routers();
        let moved = routers
            .iter_mut()
            .find(|r| r.sensor_id == "r-f0-10")
            .unwrap();
        *moved = Placement {
            sensor_id: "r-f0-10".to_owned(),
            position: Coordinates { x, y: 1.5, z: 5.0 },
        };
        rig.placements
            .saved
            .lock()
            .unwrap()
            .insert("b-est".to_owned(), routers);
    }

    #[tokio::test]
    async fn a_fresh_tick_for_a_known_building_becomes_its_dots() {
        let rig = rig();

        assert_eq!(
            rig.tracking.observe(tick("b-est", NOW), NOW).await,
            Observed::Accepted
        );

        let dots = rig.tracking.dots("b-est", NOW);
        assert_eq!(dots.len(), 1);
        assert_eq!(dots[0].room, "f0-10");
        assert_eq!(rig.tracking.held_tick("b-est"), Some(NOW));
    }

    #[tokio::test]
    async fn every_accepted_tick_is_published_with_its_dots() {
        let rig = rig();
        rig.tracking.observe(tick("b-est", NOW), NOW).await;

        let sent = rig.feed.sent.lock().unwrap().clone();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].building_id, "b-est");
        assert_eq!(sent[0].tick, NOW);
        assert_eq!(sent[0].devices, rig.tracking.dots("b-est", NOW));
    }

    // The browser holds the last list it got, so an empty building must say so.
    #[tokio::test]
    async fn a_tick_with_nobody_publishes_an_empty_list() {
        let rig = rig();
        let mut empty = tick("b-est", NOW);
        empty.connected.clear();

        rig.tracking.observe(empty, NOW).await;

        let sent = rig.feed.sent.lock().unwrap().clone();
        assert_eq!(sent.len(), 1);
        assert!(sent[0].devices.is_empty());
    }

    #[tokio::test]
    async fn a_dropped_tick_publishes_nothing() {
        let rig = rig();
        let mut broken = tick("b-est", NOW);
        broken.answered = vec!["r1".to_owned(), "r1".to_owned()];

        rig.tracking.observe(broken, NOW).await;
        rig.tracking
            .observe(tick("b-est", NOW - MAX_TICK_AGE_MS - 1), NOW)
            .await;

        assert!(rig.feed.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_building_twin_does_not_know_is_accepted_with_no_dots() {
        let rig = rig();

        assert_eq!(
            rig.tracking.observe(tick("b-gone", NOW), NOW).await,
            Observed::Accepted
        );

        assert!(rig.tracking.dots("b-gone", NOW).is_empty());
        assert_eq!(rig.tracking.held_tick("b-gone"), Some(NOW));
    }

    // Kept on screen past three polls, a dot would show someone who may long have left.
    #[tokio::test]
    async fn dots_vanish_once_their_tick_is_too_old() {
        let rig = rig();
        rig.tracking.observe(tick("b-est", NOW), NOW).await;

        assert_eq!(rig.tracking.dots("b-est", NOW + MAX_TICK_AGE_MS).len(), 1);
        assert!(
            rig.tracking
                .dots("b-est", NOW + MAX_TICK_AGE_MS + 1)
                .is_empty()
        );
    }

    // After an outage Kafka still holds ten minutes of ticks; replayed, they would move dots backwards.
    #[tokio::test]
    async fn a_tick_older_than_the_limit_is_stale_and_not_kept() {
        let rig = rig();

        let old = tick("b-est", NOW - MAX_TICK_AGE_MS - 1);
        assert_eq!(rig.tracking.observe(old, NOW).await, Observed::Stale);

        assert_eq!(rig.tracking.held_tick("b-est"), None);
        let edge = tick("b-est", NOW - MAX_TICK_AGE_MS);
        assert_eq!(rig.tracking.observe(edge, NOW).await, Observed::Accepted);
    }

    #[tokio::test]
    async fn a_tick_older_than_the_one_held_is_stale() {
        let rig = rig();
        rig.tracking.observe(tick("b-est", NOW), NOW).await;

        assert_eq!(
            rig.tracking.observe(tick("b-est", NOW - 1_000), NOW).await,
            Observed::Stale
        );
        assert_eq!(rig.tracking.held_tick("b-est"), Some(NOW));
    }

    #[tokio::test]
    async fn a_tick_from_a_collector_clock_ahead_of_ours_is_kept() {
        let rig = rig();

        assert_eq!(
            rig.tracking.observe(tick("b-est", NOW + 5_000), NOW).await,
            Observed::Accepted
        );
    }

    #[tokio::test]
    async fn a_tick_breaking_the_contract_is_invalid_and_not_kept() {
        let rig = rig();
        let mut broken = tick("b-est", NOW);
        broken.answered = vec!["r1".to_owned(), "r1".to_owned()];

        assert_eq!(rig.tracking.observe(broken, NOW).await, Observed::Invalid);
        assert_eq!(rig.tracking.held_tick("b-est"), None);
    }

    #[tokio::test]
    async fn a_moved_router_moves_the_dots_once_the_floor_plan_is_reloaded() {
        let rig = rig();
        rig.tracking.observe(tick("b-est", NOW), NOW).await;
        move_router(&rig, 25.0);

        let soon = NOW + GEOMETRY_TTL_MS - 1;
        rig.tracking.observe(tick("b-est", soon), soon).await;
        assert_eq!(rig.tracking.dots("b-est", soon)[0].room, "f0-10");

        let later = NOW + GEOMETRY_TTL_MS;
        rig.tracking.observe(tick("b-est", later), later).await;
        assert_eq!(rig.tracking.dots("b-est", later)[0].room, "f0-20");
    }

    #[tokio::test]
    async fn a_failed_reload_keeps_the_last_floor_plan() {
        let rig = rig();
        rig.tracking.observe(tick("b-est", NOW), NOW).await;
        rig.placements.refuse.store(true, Ordering::Relaxed);

        let later = NOW + GEOMETRY_TTL_MS;
        rig.tracking.observe(tick("b-est", later), later).await;

        assert_eq!(rig.tracking.dots("b-est", later).len(), 1);
    }
}
