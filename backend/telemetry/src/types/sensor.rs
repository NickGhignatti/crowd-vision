use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct Sensor {
    pub building_id: String,
    /// `None` for a sensor outside every room.
    pub room_id: Option<String>,
    pub sensor_id: String,
    pub name: String,
    pub sensor_type: String,
    pub driver: Option<String>,
    pub endpoint: Option<String>,
}

/// A rename or move; `room_id: Some(None)` moves the sensor outdoors, `None` keeps its room.
#[derive(Debug, Clone, PartialEq)]
pub struct SensorUpdate {
    pub sensor_id: String,
    pub name: Option<String>,
    pub room_id: Option<Option<String>>,
}

/// One building's sensor edits, applied all-or-nothing.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SensorChanges {
    pub create: Vec<Sensor>,
    pub update: Vec<SensorUpdate>,
    pub delete: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Command {
    pub metric: String,
    pub building_id: String,
    pub sensor_id: String,
    pub action: String,
    pub arguments: Map<String, Value>,
}

/// A building's routers in rooms: what a collector may poll there.
#[derive(Debug, Clone, PartialEq)]
pub struct CollectorBuilding {
    pub building_id: String,
    pub routers: Vec<Sensor>,
}
