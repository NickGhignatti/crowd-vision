use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct Sensor {
    pub building_id: String,
    pub room_id: String,
    pub sensor_id: String,
    pub sensor_type: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActionEndpoint {
    pub url: String,
    pub method: String,
    pub arguments: Map<String, Value>,
}
