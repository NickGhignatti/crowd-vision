use std::collections::BTreeMap;

use twin_schema::{Device, WifiObservations};

use super::estimator::{Fix, Geometry, Prior};

/// Faster than a person walks: a track never reaches a cell it would have to beat this to get to.
pub const MAX_SPEED_M_S: f64 = 2.0;
// Most people stand or stroll, so a track's spread grows this much per second unheard.
const DRIFT_M_S: f64 = 0.5;
/// A token unseen this many ticks is gone; one failed poll must not end a track.
pub const FORGET_AFTER_TICKS: u64 = 3;
// Two spreads of signal noise: a fix further off a phone's own signal than this is someone else.
const RING_TOLERANCE_DB: f64 = 9.0;

#[derive(Debug)]
struct Track {
    floor: usize,
    x: f64,
    z: f64,
    variance: f64,
    at_ms: u64,
    seen: u64,
}

impl Track {
    fn prior(&self, now_ms: u64) -> Prior {
        let seconds = now_ms.saturating_sub(self.at_ms) as f64 / 1000.0;
        Prior {
            x: self.x,
            z: self.z,
            variance: self.variance + (DRIFT_M_S * seconds).powi(2),
            reach: MAX_SPEED_M_S * seconds + 2.0 * self.variance.sqrt(),
        }
    }
}

/// One building's tracks, one per connected token, carried from tick to tick.
#[derive(Debug, Default)]
pub struct Tracks {
    ticks: u64,
    tracks: BTreeMap<String, Track>,
}

impl Tracks {
    /// Moves each connected phone's track by this tick's signals and returns the building's dots.
    pub fn step(&mut self, tick: &WifiObservations, geometry: &Geometry) -> Vec<Device> {
        self.ticks += 1;
        let mut rings: BTreeMap<&str, Vec<(&str, i32)>> = BTreeMap::new();
        for row in &tick.connected {
            rings
                .entry(&row.token)
                .or_default()
                .push((&row.router, row.signal));
        }

        let mut heard = rings.clone();
        let mut passing = Vec::new();
        for burst in &tick.bursts {
            let signals = burst.heard.iter().map(|(r, s)| (r.as_str(), *s));
            if let Some(own) = heard.get_mut(burst.token.as_str()) {
                own.extend(signals);
                continue;
            }
            let Some(fix) = geometry.fix(&burst.heard) else {
                continue;
            };
            let fitting: Vec<&str> = rings
                .iter()
                .filter(|(token, rows)| self.fits(token, rows, &fix, geometry, tick.tick))
                .map(|(token, _)| *token)
                .collect();
            match fitting[..] {
                [token] => heard.entry(token).or_default().extend(signals),
                [] => passing.push(fix),
                // It is one of them, and guessing which would hand one phone the other's path.
                _ => {}
            }
        }

        for (token, signals) in &heard {
            self.update(token, signals, geometry, tick.tick);
        }
        let ticks = self.ticks;
        self.tracks
            .retain(|_, track| ticks - track.seen < FORGET_AFTER_TICKS);

        let tracked = self.tracks.values().filter_map(|track| {
            Some(Device {
                floor: track.floor,
                room: geometry
                    .room_near(track.floor, track.x, track.z)?
                    .to_owned(),
                x: track.x,
                y: geometry.level(track.floor),
                z: track.z,
                radius: track.variance.sqrt(),
                connected: true,
            })
        });
        let passers = passing.into_iter().map(|fix| Device {
            floor: fix.floor,
            y: geometry.level(fix.floor),
            room: fix.room,
            x: fix.x,
            z: fix.z,
            radius: fix.spread,
            connected: false,
        });
        tracked.chain(passers).collect()
    }

    /// Whether the fix explains one of this phone's own signals, and its track could have walked there.
    fn fits(
        &self,
        token: &str,
        rows: &[(&str, i32)],
        fix: &Fix,
        geometry: &Geometry,
        now_ms: u64,
    ) -> bool {
        let on_ring = rows.iter().any(|(router, signal)| {
            geometry
                .expected(fix, router)
                .is_some_and(|expected| (f64::from(*signal) - expected).abs() <= RING_TOLERANCE_DB)
        });
        on_ring
            && self.tracks.get(token).is_none_or(|track| {
                let prior = track.prior(now_ms);
                track.floor == fix.floor && (fix.x - prior.x).hypot(fix.z - prior.z) <= prior.reach
            })
    }

    fn update(&mut self, token: &str, signals: &[(&str, i32)], geometry: &Geometry, now_ms: u64) {
        let Some(floor) = geometry.floor_of_loudest(signals) else {
            return;
        };
        let prior = self
            .tracks
            .get(token)
            .filter(|track| track.floor == floor)
            .map(|track| track.prior(now_ms));
        // Nothing in reach means the old track is no guide any more: start again from the signals.
        let Some(posterior) = geometry
            .posterior(floor, signals, prior.as_ref())
            .or_else(|| geometry.posterior(floor, signals, None))
        else {
            return;
        };
        self.tracks.insert(
            token.to_owned(),
            Track {
                floor,
                x: posterior.x,
                z: posterior.z,
                variance: posterior.variance,
                at_ms: now_ms,
                seen: self.ticks,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::fakes::{sim_building, sim_routers};
    use twin_schema::{ConnectedPhone, ProbeBurst};

    const NOW: u64 = 1_761_300_000_000;
    const ALL: [&str; 5] = ["r-f0-00", "r-f0-01", "r-f0-10", "r-f0-20", "r-f0-21"];
    // A cell centre in f0-10 and one in f0-21.
    const HERE: (f64, f64) = (13.75, 6.25);
    const THERE: (f64, f64) = (24.25, 15.75);

    fn geometry() -> Geometry {
        Geometry::of(&sim_building(), &sim_routers())
    }

    fn signals(geometry: &Geometry, at: (f64, f64), routers: &[&str]) -> BTreeMap<String, i32> {
        geometry.heard_from(0, at.0, at.1, routers)
    }

    fn row(geometry: &Geometry, token: &str, router: &str, at: (f64, f64)) -> ConnectedPhone {
        ConnectedPhone {
            token: token.to_owned(),
            router: router.to_owned(),
            signal: signals(geometry, at, &[router])[router],
        }
    }

    fn burst(geometry: &Geometry, token: &str, at: (f64, f64)) -> ProbeBurst {
        ProbeBurst {
            token: token.to_owned(),
            started: NOW,
            heard: signals(geometry, at, &ALL),
        }
    }

    fn tick(at: u64, connected: Vec<ConnectedPhone>, bursts: Vec<ProbeBurst>) -> WifiObservations {
        WifiObservations {
            building_id: "b-est".to_owned(),
            tick: at,
            answered: ALL.map(str::to_owned).to_vec(),
            connected,
            bursts,
            devices_per_person: None,
        }
    }

    fn off(dot: &Device, at: (f64, f64)) -> f64 {
        (dot.x - at.0).hypot(dot.z - at.1)
    }

    #[test]
    fn a_connected_phone_heard_in_its_own_burst_is_a_dot_where_it_stands() {
        let geometry = geometry();
        let mut tracks = Tracks::default();

        let dots = tracks.step(
            &tick(
                NOW,
                vec![row(&geometry, "phone-a", "r-f0-10", HERE)],
                vec![burst(&geometry, "phone-a", HERE)],
            ),
            &geometry,
        );

        assert_eq!(dots.len(), 1, "{dots:?}");
        let dot = &dots[0];
        assert!(dot.connected);
        assert_eq!((dot.floor, dot.room.as_str(), dot.y), (0, "f0-10", 0.0));
        assert!(off(dot, HERE) <= 1.5, "{dot:?}");
    }

    #[test]
    fn a_burst_under_a_fresh_token_joins_the_one_phone_whose_signal_it_explains() {
        let geometry = geometry();
        let mut tracks = Tracks::default();

        let dots = tracks.step(
            &tick(
                NOW,
                vec![
                    row(&geometry, "phone-a", "r-f0-10", HERE),
                    row(&geometry, "phone-b", "r-f0-21", THERE),
                ],
                vec![burst(&geometry, "fresh-token", HERE)],
            ),
            &geometry,
        );

        assert_eq!(dots.len(), 2, "{dots:?}");
        assert!(dots.iter().all(|dot| dot.connected));
        assert!(dots.iter().any(|dot| off(dot, HERE) <= 1.5), "{dots:?}");
    }

    #[test]
    fn a_burst_no_connected_phone_explains_is_someone_passing() {
        let geometry = geometry();
        let mut tracks = Tracks::default();

        let dots = tracks.step(
            &tick(
                NOW,
                vec![row(&geometry, "phone-b", "r-f0-21", THERE)],
                vec![burst(&geometry, "fresh-token", HERE)],
            ),
            &geometry,
        );

        let passing: Vec<&Device> = dots.iter().filter(|dot| !dot.connected).collect();
        assert_eq!(passing.len(), 1, "{dots:?}");
        assert_eq!(passing[0].room, "f0-10");
        assert!(off(passing[0], HERE) <= 1.5, "{dots:?}");
    }

    #[test]
    fn a_burst_two_phones_could_have_sent_is_given_to_neither() {
        let geometry = geometry();
        let mut tracks = Tracks::default();

        let dots = tracks.step(
            &tick(
                NOW,
                vec![
                    row(&geometry, "phone-a", "r-f0-10", HERE),
                    row(&geometry, "phone-c", "r-f0-10", HERE),
                ],
                vec![burst(&geometry, "fresh-token", HERE)],
            ),
            &geometry,
        );

        assert_eq!(dots.len(), 2, "{dots:?}");
        assert!(dots.iter().all(|dot| dot.connected));
        // Neither took the burst, so both still rest on their one shared signal alone.
        assert_eq!(dots[0], dots[1]);
    }

    #[test]
    fn a_track_never_moves_faster_than_walking() {
        let geometry = geometry();
        let mut tracks = Tracks::default();
        let first = tracks.step(
            &tick(
                NOW,
                vec![row(&geometry, "phone-a", "r-f0-10", HERE)],
                vec![burst(&geometry, "phone-a", HERE)],
            ),
            &geometry,
        );

        // Five seconds later four bursts agree it is 14.9 m away.
        let second = tracks.step(
            &tick(
                NOW + 5_000,
                vec![row(&geometry, "phone-a", "r-f0-21", THERE)],
                vec![burst(&geometry, "phone-a", THERE); 4],
            ),
            &geometry,
        );

        let (before, after) = (&first[0], &second[0]);
        let moved = (after.x - before.x).hypot(after.z - before.z);
        assert!(moved <= 2.0 * 5.0 + 2.0 * before.radius, "{moved}");
        assert!(moved > 1.0, "the track still follows: {moved}");
    }

    #[test]
    fn a_tick_with_only_the_connected_signal_keeps_the_track_where_it_was() {
        let geometry = geometry();
        let mut tracks = Tracks::default();
        let first = tracks.step(
            &tick(
                NOW,
                vec![row(&geometry, "phone-a", "r-f0-10", HERE)],
                vec![burst(&geometry, "phone-a", HERE)],
            ),
            &geometry,
        );

        let second = tracks.step(
            &tick(
                NOW + 10_000,
                vec![row(&geometry, "phone-a", "r-f0-10", HERE)],
                vec![],
            ),
            &geometry,
        );

        assert!(
            off(&second[0], (first[0].x, first[0].z)) <= 2.0,
            "{second:?}"
        );
        assert_eq!(second[0].room, "f0-10");
    }

    #[test]
    fn a_track_outlives_two_missed_ticks_and_is_gone_after_the_third() {
        let geometry = geometry();
        let mut tracks = Tracks::default();
        let seen = tick(
            NOW,
            vec![row(&geometry, "phone-a", "r-f0-10", HERE)],
            vec![],
        );
        tracks.step(&seen, &geometry);

        for missed in 1..FORGET_AFTER_TICKS {
            let dots = tracks.step(&tick(NOW + missed * 10_000, vec![], vec![]), &geometry);
            assert_eq!(dots.len(), 1, "after {missed} missed");
        }
        let dots = tracks.step(&tick(NOW + 30_000, vec![], vec![]), &geometry);
        assert!(dots.is_empty(), "{dots:?}");
    }

    #[test]
    fn a_phone_on_a_router_with_no_placement_is_no_dot() {
        let geometry = geometry();
        let mut tracks = Tracks::default();
        let unplaced = ConnectedPhone {
            token: "phone-a".to_owned(),
            router: "unplaced".to_owned(),
            signal: -50,
        };

        assert!(
            tracks
                .step(&tick(NOW, vec![unplaced], vec![]), &geometry)
                .is_empty()
        );
    }

    mod recorded {
        use std::collections::HashMap;

        use serde::Deserialize;

        use super::*;
        use crate::domain::{Building, Placement};

        // From tests/data/record_wifi.py: the collector's own code run on ap-simulator's world.
        const RECORDING: &str = include_str!("../../tests/data/wifi-recording.jsonl");

        #[derive(Deserialize)]
        struct Header {
            building: Building,
            placements: Vec<Placement>,
        }

        #[derive(Deserialize)]
        struct Spot {
            x: f64,
            z: f64,
            floor: usize,
            room: Option<String>,
        }

        #[derive(Deserialize)]
        struct Sent {
            owner: Option<String>,
        }

        #[derive(Deserialize)]
        struct Recorded {
            tick: WifiObservations,
            phones: HashMap<String, Spot>,
            bursts: Vec<Sent>,
        }

        #[derive(Default)]
        struct Score {
            judged: usize,
            room: usize,
            routers_room: usize,
            errors: Vec<f64>,
            miscount: usize,
            routers_miscount: usize,
            passing: usize,
            truly_passing: usize,
        }

        fn replay() -> Score {
            let mut lines = RECORDING.lines();
            let header: Header = serde_json::from_str(lines.next().unwrap()).unwrap();
            let geometry = Geometry::of(&header.building, &header.placements);
            let router_room: HashMap<&str, &str> = header
                .placements
                .iter()
                .map(|p| {
                    let floor = geometry.floor_of_loudest(&[(&p.sensor_id, 0)]).unwrap();
                    let room = geometry
                        .room_near(floor, p.position.x, p.position.z)
                        .unwrap();
                    (p.sensor_id.as_str(), room)
                })
                .collect();

            let mut tracks = Tracks::default();
            let mut score = Score::default();
            for line in lines {
                let recorded: Recorded = serde_json::from_str(line).unwrap();
                let dots = tracks.step(&recorded.tick, &geometry);
                score.passing += dots.iter().filter(|dot| !dot.connected).count();
                score.truly_passing += recorded.bursts.iter().filter(|b| b.owner.is_none()).count();

                let mut counts: HashMap<&str, [i64; 3]> = HashMap::new();
                for (token, truth) in &recorded.phones {
                    let Some(room) = truth.room.as_deref() else {
                        continue;
                    };
                    let loudest = recorded
                        .tick
                        .connected
                        .iter()
                        .filter(|row| row.token == *token)
                        .max_by_key(|row| row.signal)
                        .unwrap();
                    let routers = router_room[loudest.router.as_str()];
                    score.judged += 1;
                    score.routers_room += usize::from(routers == room);
                    counts.entry(room).or_default()[0] += 1;
                    counts.entry(routers).or_default()[2] += 1;

                    let track = &tracks.tracks[token];
                    let placed = geometry.room_near(track.floor, track.x, track.z).unwrap();
                    counts.entry(placed).or_default()[1] += 1;
                    if track.floor == truth.floor {
                        score
                            .errors
                            .push((track.x - truth.x).hypot(track.z - truth.z));
                        score.room += usize::from(placed == room);
                    }
                }
                for [truth, dots, routers] in counts.into_values() {
                    score.miscount += truth.abs_diff(dots) as usize;
                    score.routers_miscount += truth.abs_diff(routers) as usize;
                }
            }
            score.errors.sort_by(f64::total_cmp);
            score
        }

        // Measured 2026-10-26: room 0.794 vs 0.750, median 4.0 m, p90 8.1 m, miscount 1462 vs 1988.
        // The recording is fixed, so these bounds only catch a change that makes dots worse.
        #[test]
        fn on_recorded_ticks_dots_beat_counting_each_phone_in_its_routers_room() {
            let score = replay();
            let share = |n: usize| n as f64 / score.judged as f64;
            let at = |q: f64| score.errors[(q * score.errors.len() as f64) as usize];
            let summary = format!(
                "room {:.3} vs {:.3}, median {:.2} m, p90 {:.2} m, miscount {} vs {}, passing {} of {}",
                share(score.room),
                share(score.routers_room),
                at(0.5),
                at(0.9),
                score.miscount,
                score.routers_miscount,
                score.passing,
                score.truly_passing,
            );

            assert!(share(score.room) >= 0.78, "{summary}");
            assert!(share(score.room) > share(score.routers_room), "{summary}");
            assert!(at(0.5) <= 4.5 && at(0.9) <= 9.0, "{summary}");
            assert!(
                score.miscount * 10 <= score.routers_miscount * 8,
                "{summary}"
            );
            // A burst nobody can be sure of is dropped, so passing dots never outnumber passers.
            assert!(score.passing <= score.truly_passing, "{summary}");
        }
    }
}
