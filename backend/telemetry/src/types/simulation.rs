use serde::Serialize;
use std::collections::BTreeMap;

/// A point in the twin's frame, y up.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Coordinates {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// A room's extent: width along x, height up y, depth along z.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Dimensions {
    pub width: f64,
    pub height: f64,
    pub depth: f64,
}

/// A sensor as a simulator sees it: always in a room, because readings are room-keyed.
#[derive(Debug, Clone, PartialEq)]
pub struct SimulatedSensor {
    pub sensor_id: String,
    pub sensor_type: String,
    pub room_id: String,
    /// `None` until the sensor is placed in the twin.
    pub position: Option<Coordinates>,
}

/// A room as a box; `position` is its footprint centre at floor level.
#[derive(Debug, Clone, PartialEq)]
pub struct SimulatedRoom {
    pub room_id: String,
    pub position: Coordinates,
    pub dimensions: Dimensions,
}

/// A simulator and the device kinds it produces readings for.
#[derive(Debug, Clone, PartialEq)]
pub struct SimulatorSpec {
    pub name: String,
    pub kinds: Vec<String>,
}

/// What each simulator is told at start; every configured simulator has an entry, maybe empty.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SimulationPlan {
    pub by_simulator: BTreeMap<String, Vec<SimulatedSensor>>,
    /// Sensors no simulator takes: kinds nobody claims, and outdoor sensors.
    pub unsimulated: Vec<String>,
}
