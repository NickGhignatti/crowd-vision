pub mod air_quality;
pub mod common;
pub mod device_count;
pub mod people_count;
pub mod temperature;

use crate::types::plugin::SensorPlugin;

/// Every plugin the service registers; `main.rs` builds the registry from this list.
pub fn all() -> Vec<Box<dyn SensorPlugin>> {
    vec![
        Box::new(temperature::TemperaturePlugin),
        Box::new(people_count::PeopleCountPlugin),
        Box::new(air_quality::AirQualityPlugin),
        Box::new(device_count::TotalDeviceCountPlugin),
        Box::new(device_count::RatioDeviceCountPlugin),
    ]
}

#[cfg(test)]
mod tests {
    use telemetry_schema::ALERTABLE_METRICS;

    #[test]
    fn every_plugin_with_bounds_is_alertable_and_nothing_else_is() {
        let mut bounded: Vec<&str> = super::all()
            .iter()
            .filter(|plugin| !plugin.bounds().is_empty())
            .map(|plugin| plugin.key())
            .collect();
        bounded.sort_unstable();
        let mut alertable = ALERTABLE_METRICS.to_vec();
        alertable.sort_unstable();
        assert_eq!(bounded, alertable);
    }
}
