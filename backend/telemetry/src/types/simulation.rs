use std::collections::BTreeMap;

/// A sensor as a simulator sees it: always in a room, because readings are room-keyed.
#[derive(Debug, Clone, PartialEq)]
pub struct SimulatedSensor {
    pub sensor_id: String,
    pub sensor_type: String,
    pub room_id: String,
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
