use crate::types::reading::Reading;
use serde_json::Value;

pub fn reading(payload: &Value, metric: &str, value: f64) -> Reading {
    Reading {
        building_id: payload["buildingId"]
            .as_str()
            .unwrap_or_default()
            .to_owned(),
        room_id: payload["roomId"].as_str().unwrap_or_default().to_owned(),
        metric: metric.to_owned(),
        ts_ms: payload["timestamp"].as_f64().unwrap_or_default() as i64,
        value,
        payload: payload.as_object().cloned().unwrap_or_default(),
    }
}
