mod buildings;
mod readings;
mod sensors;
mod thresholds;

pub use buildings::PgBuildings;
pub use readings::PgReadings;
pub use sensors::PgSensors;
pub use thresholds::PgThresholds;

use chrono::{DateTime, Utc};

pub fn to_timestamp(ms: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(ms).unwrap_or_default()
}

pub fn to_millis(ts: DateTime<Utc>) -> i64 {
    ts.timestamp_millis()
}
