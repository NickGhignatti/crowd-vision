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
