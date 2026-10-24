use std::collections::HashMap;
use std::sync::Mutex;

use twin_schema::WifiObservations;

/// Older than this a tick shows where people were, not where they are: three collector polls.
pub const MAX_TICK_AGE_MS: u64 = 30_000;

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

/// Each building's newest Wi-Fi tick; the estimator turning it into dots builds on this.
#[derive(Default)]
pub struct Tracking {
    latest: Mutex<HashMap<String, WifiObservations>>,
}

impl Tracking {
    /// Keeps the tick unless it breaks the contract, is too old, or is older than the one held.
    pub fn observe(&self, tick: WifiObservations, now_ms: u64) -> Observed {
        if !tick.problems().is_empty() {
            return Observed::Invalid;
        }
        if now_ms.saturating_sub(tick.tick) > MAX_TICK_AGE_MS {
            return Observed::Stale;
        }
        let mut latest = self.latest.lock().expect("tracking lock");
        if latest
            .get(&tick.building_id)
            .is_some_and(|held| held.tick > tick.tick)
        {
            return Observed::Stale;
        }
        latest.insert(tick.building_id.clone(), tick);
        Observed::Accepted
    }

    pub fn latest(&self, building_id: &str) -> Option<WifiObservations> {
        self.latest
            .lock()
            .expect("tracking lock")
            .get(building_id)
            .cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: u64 = 1_761_300_000_000;

    fn tick(building: &str, at: u64) -> WifiObservations {
        WifiObservations {
            building_id: building.to_owned(),
            tick: at,
            answered: vec!["r1".to_owned()],
            connected: vec![],
            bursts: vec![],
            devices_per_person: None,
        }
    }

    #[test]
    fn a_fresh_tick_becomes_its_buildings_latest() {
        let tracking = Tracking::default();

        assert_eq!(tracking.observe(tick("b1", NOW), NOW), Observed::Accepted);

        assert_eq!(tracking.latest("b1"), Some(tick("b1", NOW)));
        assert_eq!(tracking.latest("b2"), None);
    }

    #[test]
    fn a_newer_tick_replaces_the_one_held_and_buildings_stay_apart() {
        let tracking = Tracking::default();
        tracking.observe(tick("b1", NOW - 10_000), NOW);
        tracking.observe(tick("b2", NOW - 10_000), NOW);

        assert_eq!(tracking.observe(tick("b1", NOW), NOW), Observed::Accepted);

        assert_eq!(tracking.latest("b1").unwrap().tick, NOW);
        assert_eq!(tracking.latest("b2").unwrap().tick, NOW - 10_000);
    }

    // After an outage Kafka still holds ten minutes of ticks; replayed, they would move dots backwards.
    #[test]
    fn a_tick_older_than_the_limit_is_stale_and_not_kept() {
        let tracking = Tracking::default();

        let old = tick("b1", NOW - MAX_TICK_AGE_MS - 1);
        assert_eq!(tracking.observe(old, NOW), Observed::Stale);

        assert_eq!(tracking.latest("b1"), None);
        let edge = tick("b1", NOW - MAX_TICK_AGE_MS);
        assert_eq!(tracking.observe(edge, NOW), Observed::Accepted);
    }

    #[test]
    fn a_tick_older_than_the_one_held_is_stale() {
        let tracking = Tracking::default();
        tracking.observe(tick("b1", NOW), NOW);

        assert_eq!(
            tracking.observe(tick("b1", NOW - 1_000), NOW),
            Observed::Stale
        );
        assert_eq!(tracking.latest("b1").unwrap().tick, NOW);
    }

    #[test]
    fn a_tick_from_a_collector_clock_ahead_of_ours_is_kept() {
        let tracking = Tracking::default();

        assert_eq!(
            tracking.observe(tick("b1", NOW + 5_000), NOW),
            Observed::Accepted
        );
    }

    #[test]
    fn a_tick_breaking_the_contract_is_invalid_and_not_kept() {
        let tracking = Tracking::default();
        let mut broken = tick("b1", NOW);
        broken.answered = vec!["r1".to_owned(), "r1".to_owned()];

        assert_eq!(tracking.observe(broken, NOW), Observed::Invalid);
        assert_eq!(tracking.latest("b1"), None);
    }
}
