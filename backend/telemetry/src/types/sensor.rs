use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct Sensor {
    pub building_id: String,
    pub room_id: String,
    pub sensor_id: String,
    pub sensor_type: String,
    pub driver: Option<String>,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Command {
    pub metric: String,
    pub building_id: String,
    pub room_id: String,
    pub sensor_id: String,
    pub action: String,
    pub arguments: Map<String, Value>,
}
