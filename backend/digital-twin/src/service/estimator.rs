use std::collections::{BTreeMap, BTreeSet, HashMap};

use crate::domain::{Building, Placement, Room};

/// Where a phone most likely stood: a point on one floor, inside one room.
#[derive(Debug, Clone, PartialEq)]
pub struct Fix {
    pub floor: usize,
    pub room: String,
    pub x: f64,
    pub z: f64,
    /// One spread of the position, in metres along each axis.
    pub spread: f64,
    cell: usize,
}

/// Where a track stood before this tick, how sure it is, and how far it can have walked since.
#[derive(Debug, Clone, PartialEq)]
pub struct Prior {
    pub x: f64,
    pub z: f64,
    pub variance: f64,
    pub reach: f64,
}

/// A floor's cells weighed by how well each explains the signals, and the prior if one is given.
#[derive(Debug, Clone, PartialEq)]
pub struct Posterior {
    pub floor: usize,
    pub x: f64,
    pub z: f64,
    /// Per axis, in square metres.
    pub variance: f64,
    best: usize,
}

pub const SIGNAL_AT_1M_DBM: f64 = -40.0;
pub const PATH_LOSS_EXPONENT: f64 = 2.2;
pub const WALL_LOSS_DB: f64 = 5.0;
const CELL_M: f64 = 0.5;
// The simulator's 4 dB shadowing and 2 dB fading, combined.
const SIGNAL_SD_DB: f64 = 4.5;
// Two circles cross at two points: a third router is what picks one.
const MIN_ROUTERS: usize = 3;
const FLOOR_TOLERANCE_M: f64 = 0.5;
// Rooms drawn edge to edge rarely share a coordinate exactly: crossings this close are one wall.
const WALL_TOLERANCE_M: f64 = 0.3;

/// A floor plan outline as (min_x, min_z, max_x, max_z).
type Bounds = (f64, f64, f64, f64);

struct Cell {
    x: f64,
    z: f64,
    room: usize,
}

#[derive(Default)]
struct Floor {
    columns: HashMap<String, usize>,
    cells: Vec<Cell>,
    // One row per cell, one column per router on this floor.
    expected: Vec<f64>,
}

/// One building's floor plan and routers, with every cell's expected signal from each router.
pub struct Geometry {
    rooms: Vec<String>,
    levels: Vec<f64>,
    router_floor: HashMap<String, usize>,
    floors: Vec<Floor>,
}

impl Geometry {
    /// Cuts each floor into 0.5 m cells inside rooms; a router with no placement is left out.
    pub fn of(building: &Building, placements: &[Placement]) -> Self {
        let bottom = |room: &Room| room.position.y - room.dimensions.height / 2.0;
        let mut bottoms: Vec<f64> = building.rooms.iter().map(bottom).collect();
        bottoms.sort_by(f64::total_cmp);
        bottoms.dedup_by(|b, kept| *b - *kept <= FLOOR_TOLERANCE_M);
        let floor_of = |y: f64| {
            bottoms
                .partition_point(|b| *b <= y + 0.01)
                .saturating_sub(1)
        };

        let mut plans: Vec<Vec<(usize, Bounds)>> = vec![Vec::new(); bottoms.len()];
        for (index, room) in building.rooms.iter().enumerate() {
            let (half_w, half_d) = (room.dimensions.width / 2.0, room.dimensions.depth / 2.0);
            let (x, z) = (room.position.x, room.position.z);
            plans[floor_of(bottom(room))]
                .push((index, (x - half_w, z - half_d, x + half_w, z + half_d)));
        }

        let mut router_floor = HashMap::new();
        let mut routers: Vec<Vec<(f64, f64)>> = vec![Vec::new(); bottoms.len()];
        let mut floors: Vec<Floor> = (0..bottoms.len()).map(|_| Floor::default()).collect();
        if !bottoms.is_empty() {
            for placement in placements {
                let floor = floor_of(placement.position.y);
                router_floor.insert(placement.sensor_id.clone(), floor);
                floors[floor]
                    .columns
                    .insert(placement.sensor_id.clone(), routers[floor].len());
                routers[floor].push((placement.position.x, placement.position.z));
            }
        }

        for ((floor, plan), routers) in floors.iter_mut().zip(&plans).zip(&routers) {
            let outlines: Vec<Bounds> = plan.iter().map(|(_, bounds)| *bounds).collect();
            let (min_x, min_z, max_x, max_z) = outlines.iter().fold(
                (
                    f64::INFINITY,
                    f64::INFINITY,
                    f64::NEG_INFINITY,
                    f64::NEG_INFINITY,
                ),
                |a, b| (a.0.min(b.0), a.1.min(b.1), a.2.max(b.2), a.3.max(b.3)),
            );
            let across = ((max_x - min_x) / CELL_M).ceil() as usize;
            let along = ((max_z - min_z) / CELL_M).ceil() as usize;
            for i in 0..across {
                for j in 0..along {
                    let x = min_x + (i as f64 + 0.5) * CELL_M;
                    let z = min_z + (j as f64 + 0.5) * CELL_M;
                    let Some((room, _)) = plan
                        .iter()
                        .find(|(_, b)| b.0 <= x && x <= b.2 && b.1 <= z && z <= b.3)
                    else {
                        continue;
                    };
                    floor.cells.push(Cell { x, z, room: *room });
                    floor.expected.extend(routers.iter().map(|&(rx, rz)| {
                        expected_signal(
                            (rx - x).hypot(rz - z),
                            walls_between((x, z), (rx, rz), &outlines),
                        )
                    }));
                }
            }
        }

        Self {
            rooms: building.rooms.iter().map(|room| room.id.clone()).collect(),
            levels: bottoms,
            router_floor,
            floors,
        }
    }

    /// The cell whose expected signals differ least, squared, from what the routers heard.
    /// Only the loudest router's floor counts: a slab costs 18 dB.
    pub fn fix(&self, heard: &BTreeMap<String, i32>) -> Option<Fix> {
        let heard: Vec<(&str, i32)> = heard.iter().map(|(r, s)| (r.as_str(), *s)).collect();
        let floor = self.floor_of_loudest(&heard)?;
        let plan = &self.floors[floor];
        let placed = heard
            .iter()
            .filter(|(router, _)| plan.columns.contains_key(*router))
            .count();
        if placed < MIN_ROUTERS {
            return None;
        }
        let posterior = self.posterior(floor, &heard, None)?;
        let cell = &plan.cells[posterior.best];
        Some(Fix {
            floor,
            room: self.rooms[cell.room].clone(),
            x: cell.x,
            z: cell.z,
            spread: posterior.variance.sqrt(),
            cell: posterior.best,
        })
    }

    /// The floor of the loudest placed router among these.
    pub fn floor_of_loudest(&self, heard: &[(&str, i32)]) -> Option<usize> {
        heard
            .iter()
            .filter_map(|(router, signal)| Some((*self.router_floor.get(*router)?, *signal)))
            .max_by_key(|(_, signal)| *signal)
            .map(|(floor, _)| floor)
    }

    /// Weighs every cell on `floor` by the signals; a prior adds a pull toward it and cuts off
    /// cells beyond its reach. None when no router heard is placed there, or no cell is in reach.
    pub fn posterior(
        &self,
        floor: usize,
        heard: &[(&str, i32)],
        prior: Option<&Prior>,
    ) -> Option<Posterior> {
        let plan = self.floors.get(floor)?;
        let heard: Vec<(usize, f64)> = heard
            .iter()
            .filter_map(|(router, signal)| Some((*plan.columns.get(*router)?, f64::from(*signal))))
            .collect();
        if heard.is_empty() {
            return None;
        }

        let costs: Vec<(usize, f64)> = plan
            .cells
            .iter()
            .zip(plan.expected.chunks(plan.columns.len()))
            .enumerate()
            .filter_map(|(index, (cell, row))| {
                let misfit = heard
                    .iter()
                    .map(|&(c, s)| (s - row[c]).powi(2))
                    .sum::<f64>();
                let mut cost = misfit / (2.0 * SIGNAL_SD_DB.powi(2));
                if let Some(prior) = prior {
                    let walked = (cell.x - prior.x).powi(2) + (cell.z - prior.z).powi(2);
                    if walked > prior.reach.powi(2) {
                        return None;
                    }
                    cost += walked / (2.0 * prior.variance);
                }
                Some((index, cost))
            })
            .collect();
        let &(best, low) = costs.iter().min_by(|a, b| a.1.total_cmp(&b.1))?;

        let weighed: Vec<(&Cell, f64)> = costs
            .iter()
            .map(|&(index, cost)| (&plan.cells[index], (low - cost).exp()))
            .collect();
        let total: f64 = weighed.iter().map(|(_, w)| w).sum();
        let x = weighed.iter().map(|(c, w)| w * c.x).sum::<f64>() / total;
        let z = weighed.iter().map(|(c, w)| w * c.z).sum::<f64>() / total;
        let spread = weighed
            .iter()
            .map(|(c, w)| w * ((c.x - x).powi(2) + (c.z - z).powi(2)))
            .sum::<f64>();
        Some(Posterior {
            floor,
            x,
            z,
            variance: (spread / (2.0 * total)).max(CELL_M * CELL_M),
            best,
        })
    }

    /// The signal `router` should hear from the fix's cell; None when it is not on that floor.
    pub fn expected(&self, fix: &Fix, router: &str) -> Option<f64> {
        let plan = &self.floors[fix.floor];
        let column = *plan.columns.get(router)?;
        Some(plan.expected[fix.cell * plan.columns.len() + column])
    }

    /// The room of the cell closest to this point.
    pub fn room_near(&self, floor: usize, x: f64, z: f64) -> Option<&str> {
        let distance = |cell: &&Cell| (cell.x - x).powi(2) + (cell.z - z).powi(2);
        let cell = self
            .floors
            .get(floor)?
            .cells
            .iter()
            .min_by(|a, b| distance(a).total_cmp(&distance(b)))?;
        Some(&self.rooms[cell.room])
    }

    /// Rooms on a floor with at least one placed router, each once: the rooms twin can count.
    pub fn covered_rooms(&self) -> BTreeSet<&str> {
        self.floors
            .iter()
            .filter(|floor| !floor.columns.is_empty())
            .flat_map(|floor| floor.cells.iter())
            .map(|cell| self.rooms[cell.room].as_str())
            .collect()
    }

    /// Height of the floor's lowest room bottom.
    pub fn level(&self, floor: usize) -> f64 {
        self.levels[floor]
    }

    /// What every named router should hear from the cell nearest this point.
    #[cfg(test)]
    pub fn heard_from(
        &self,
        floor: usize,
        x: f64,
        z: f64,
        routers: &[&str],
    ) -> BTreeMap<String, i32> {
        let plan = &self.floors[floor];
        let distance = |cell: &Cell| (cell.x - x).powi(2) + (cell.z - z).powi(2);
        let cell = (0..plan.cells.len())
            .min_by(|&a, &b| distance(&plan.cells[a]).total_cmp(&distance(&plan.cells[b])))
            .unwrap();
        routers
            .iter()
            .map(|router| {
                let column = plan.columns[*router];
                let expected = plan.expected[cell * plan.columns.len() + column];
                ((*router).to_owned(), expected.round() as i32)
            })
            .collect()
    }
}

/// ap-simulator's radio rule: the signal a router hears from a phone this far away.
pub fn expected_signal(metres: f64, walls: usize) -> f64 {
    SIGNAL_AT_1M_DBM
        - 10.0 * PATH_LOSS_EXPONENT * metres.max(1.0).log10()
        - WALL_LOSS_DB * walls as f64
}

/// Walls a straight path from `a` to `b` crosses, on one floor plan.
fn walls_between(a: (f64, f64), b: (f64, f64), outlines: &[Bounds]) -> usize {
    let length = (b.0 - a.0).hypot(b.1 - a.1);
    let mut crossings: Vec<f64> = outlines
        .iter()
        .flat_map(|outline| crossings(*outline, a, b))
        .map(|t| t * length)
        .collect();
    crossings.sort_by(f64::total_cmp);
    let mut last = f64::NEG_INFINITY;
    crossings
        .into_iter()
        .filter(|&at| {
            let wall = at - last > WALL_TOLERANCE_M;
            last = at;
            wall
        })
        .count()
}

/// Where, as a fraction of `a` to `b`, the path crosses this outline (Liang-Barsky clipping).
fn crossings((min_x, min_z, max_x, max_z): Bounds, a: (f64, f64), b: (f64, f64)) -> Vec<f64> {
    let (dx, dz) = (b.0 - a.0, b.1 - a.1);
    let (mut t_in, mut t_out) = (f64::NEG_INFINITY, f64::INFINITY);
    for (p, q) in [
        (-dx, a.0 - min_x),
        (dx, max_x - a.0),
        (-dz, a.1 - min_z),
        (dz, max_z - a.1),
    ] {
        if p == 0.0 {
            if q < 0.0 {
                return Vec::new();
            }
            continue;
        }
        let t = q / p;
        if p < 0.0 {
            t_in = t_in.max(t);
        } else {
            t_out = t_out.min(t);
        }
    }
    if t_in > t_out {
        return Vec::new();
    }
    [t_in, t_out]
        .into_iter()
        .filter(|t| 0.0 < *t && *t < 1.0)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::fakes::{sim_building as building, sim_routers as placements};

    fn heard(signals: &[(&str, i32)]) -> BTreeMap<String, i32> {
        signals.iter().map(|(r, s)| ((*r).to_owned(), *s)).collect()
    }

    #[test]
    fn the_expected_signal_follows_the_simulators_radio_rule() {
        assert_eq!(expected_signal(10.0, 0), -62.0);
        assert_eq!(expected_signal(10.0, 2), -72.0);
        // Closer than a metre the rule stops growing: it was fitted from 1 m out.
        assert_eq!(expected_signal(0.3, 0), -40.0);
    }

    // A real burst from ap-simulator: the phone stood at (18.15, 1.74) in f0-10.
    #[test]
    fn a_burst_lands_on_the_cell_whose_expected_signals_fit_best() {
        let geometry = Geometry::of(&building(), &placements());

        let fix = geometry.fix(&heard(&[
            ("r-f0-00", -75),
            ("r-f0-01", -74),
            ("r-f0-10", -61),
            ("r-f0-20", -63),
            ("r-f0-21", -82),
        ]));

        let fix = fix.unwrap();
        assert_eq!((fix.floor, fix.room.as_str()), (0, "f0-10"));
        assert_eq!((fix.x, fix.z), (19.75, 0.25));
    }

    #[test]
    fn signals_matching_one_cell_exactly_land_on_that_cell() {
        let geometry = Geometry::of(&building(), &placements());
        // From (12.25, 13.75) in f0-11, each of these routers sits one wall away.
        let at = |rx: f64, rz: f64, walls| {
            expected_signal((12.25f64 - rx).hypot(13.75 - rz), walls).round() as i32
        };

        let fix = geometry
            .fix(&heard(&[
                ("r-f0-01", at(5.0, 15.0, 1)),
                ("r-f0-10", at(15.0, 5.0, 1)),
                ("r-f0-21", at(25.0, 15.0, 1)),
            ]))
            .unwrap();

        assert_eq!(fix.room, "f0-11");
        assert!((fix.x - 12.25).hypot(fix.z - 13.75) <= 1.0, "{fix:?}");
    }

    // A floor slab costs 18 dB, more than two routers on one floor usually differ by.
    #[test]
    fn the_loudest_router_picks_the_floor_and_other_floors_routers_are_left_out() {
        let geometry = Geometry::of(&building(), &placements());

        let fix = geometry
            .fix(&heard(&[
                ("r-f1-10", -40),
                ("r-f1-00", -67),
                ("r-f1-20", -56),
                ("r-f1-21", -71),
                ("r-f0-10", -65),
            ]))
            .unwrap();

        assert_eq!(fix.floor, 1);
        assert!(fix.room.starts_with("f1-"), "{fix:?}");
    }

    // Two circles cross at two points, so fewer routers than three give no single answer.
    #[test]
    fn fewer_than_three_placed_routers_on_the_floor_give_no_fix() {
        let geometry = Geometry::of(&building(), &placements());

        assert_eq!(
            geometry.fix(&heard(&[
                ("r-f0-10", -50),
                ("r-f0-20", -60),
                ("r-f1-20", -80)
            ])),
            None
        );
        assert_eq!(
            geometry.fix(&heard(&[
                ("r-f0-10", -50),
                ("r-f0-20", -60),
                ("unplaced", -55)
            ])),
            None
        );
        assert_eq!(geometry.fix(&heard(&[])), None);
    }

    // Two rooms drawn edge to edge are one wall between them, not two.
    #[test]
    fn a_shared_wall_counts_once_and_a_path_inside_one_room_crosses_none() {
        let left = (0.0, 0.0, 10.0, 10.0);
        let right = (10.0, 0.0, 20.0, 10.0);
        let gap = (10.2, 0.0, 20.0, 10.0);

        assert_eq!(walls_between((5.0, 5.0), (15.0, 5.0), &[left, right]), 1);
        assert_eq!(walls_between((5.0, 5.0), (15.0, 5.0), &[left, gap]), 1);
        assert_eq!(walls_between((2.0, 2.0), (8.0, 8.0), &[left, right]), 0);
        assert_eq!(walls_between((5.0, 5.0), (25.0, 5.0), &[left, right]), 2);
    }

    #[test]
    fn every_room_on_a_floor_with_a_placed_router_is_covered() {
        let geometry = Geometry::of(&building(), &placements());

        assert_eq!(geometry.covered_rooms().len(), building().rooms.len());
    }

    // Twin can place no one on a floor without routers: zero there would be a guess, not a count.
    #[test]
    fn a_floor_with_no_placed_router_is_not_covered() {
        let ground: Vec<Placement> = placements()
            .into_iter()
            .filter(|p| p.sensor_id.starts_with("r-f0"))
            .collect();
        let geometry = Geometry::of(&building(), &ground);

        let covered = geometry.covered_rooms();
        assert!(!covered.is_empty());
        assert!(
            covered.iter().all(|room| room.starts_with("f0-")),
            "{covered:?}"
        );
    }

    #[test]
    fn a_building_with_no_rooms_gives_no_fix() {
        let empty = Building {
            rooms: vec![],
            ..building()
        };
        let geometry = Geometry::of(&empty, &placements());

        assert_eq!(
            geometry.fix(&heard(&[
                ("r-f0-10", -50),
                ("r-f0-20", -60),
                ("r-f0-00", -60)
            ])),
            None
        );
    }
}
