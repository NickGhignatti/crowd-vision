use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct Reading {
    pub building_id: String,
    pub room_id: String,
    pub metric: String,
    pub ts_ms: i64,
    pub value: f64,
    pub payload: Map<String, Value>,
}

/// One metric summed over a building's rooms at its newest report.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BuildingTotal {
    pub ts_ms: i64,
    pub value: f64,
}
