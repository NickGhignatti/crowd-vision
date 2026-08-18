use std::hash::{DefaultHasher, Hash, Hasher};
use std::time::Duration;

const JITTER_FRACTION: u32 = 8;
const MAX_SWEEP_INTERVAL: Duration = Duration::from_secs(30);

pub fn lifetime_for(socket_id: &str, base: Duration) -> Duration {
    let spread = base / JITTER_FRACTION;
    if spread.is_zero() {
        return base;
    }

    let mut hasher = DefaultHasher::new();
    socket_id.hash(&mut hasher);
    base - Duration::from_nanos(hasher.finish() % spread.as_nanos() as u64)
}

pub fn sweep_interval(base: Duration) -> Duration {
    (base / 10).min(MAX_SWEEP_INTERVAL)
}

#[cfg(test)]
mod tests {
    use super::*;

    const BASE: Duration = Duration::from_secs(900);

    #[test]
    fn a_lifetime_never_exceeds_the_configured_base() {
        for id in ["a", "b", "c", "socket-1", "socket-2", ""] {
            assert!(lifetime_for(id, BASE) <= BASE);
        }
    }

    #[test]
    fn a_lifetime_stays_within_one_jitter_window_of_the_base() {
        for id in ["a", "b", "c", "socket-1", "socket-2", ""] {
            assert!(lifetime_for(id, BASE) >= BASE - BASE / JITTER_FRACTION);
        }
    }

    #[test]
    fn the_same_socket_always_gets_the_same_lifetime() {
        assert_eq!(
            lifetime_for("socket-1", BASE),
            lifetime_for("socket-1", BASE)
        );
    }

    #[test]
    fn different_sockets_are_spread_across_the_window() {
        let lifetimes: std::collections::HashSet<Duration> = (0..50)
            .map(|n| lifetime_for(&format!("socket-{n}"), BASE))
            .collect();

        assert!(
            lifetimes.len() > 40,
            "expected the jitter to spread expiries, got {} distinct values",
            lifetimes.len()
        );
    }

    #[test]
    fn a_base_too_small_to_jitter_is_used_as_is() {
        let tiny = Duration::from_nanos(4);
        assert_eq!(lifetime_for("socket-1", tiny), tiny);
    }

    #[test]
    fn the_sweep_runs_often_enough_to_bound_the_overshoot() {
        assert_eq!(sweep_interval(BASE), Duration::from_secs(30));
        assert_eq!(
            sweep_interval(Duration::from_secs(60)),
            Duration::from_secs(6)
        );
    }

    #[test]
    fn the_sweep_interval_is_capped_for_long_lifetimes() {
        assert_eq!(
            sweep_interval(Duration::from_secs(86_400)),
            MAX_SWEEP_INTERVAL
        );
    }
}
