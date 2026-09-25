pub mod air_quality;
pub mod common;
pub mod device_count;
pub mod people_count;
pub mod temperature;

use crate::types::device::DeviceKind;
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

/// What a sensor is registered as: the physical device, which may report several metrics.
pub fn devices() -> Vec<DeviceKind> {
    vec![
        DeviceKind {
            key: "router",
            label: "Router",
            metrics: &["totalDeviceCount", "ratioDeviceCount"],
        },
        DeviceKind {
            key: "temperature",
            label: "Thermostat",
            metrics: &["temperature"],
        },
        DeviceKind {
            key: "airQuality",
            label: "Air quality station",
            metrics: &["airQuality"],
        },
        DeviceKind {
            key: "peopleCount",
            label: "People counter",
            metrics: &["peopleCount"],
        },
    ]
}

#[cfg(test)]
mod tests {
    use crate::kernel::devices::DeviceCatalog;
    use crate::kernel::registry::PluginRegistry;
    use telemetry_schema::ALERTABLE_METRICS;

    #[test]
    fn every_metric_comes_from_exactly_one_device() {
        let registry = PluginRegistry::new(super::all()).unwrap();
        DeviceCatalog::new(super::devices(), &registry).unwrap();
    }

    #[test]
    fn a_router_produces_both_device_counts() {
        let router = super::devices()
            .into_iter()
            .find(|device| device.key == "router")
            .unwrap();
        assert_eq!(router.metrics, ["totalDeviceCount", "ratioDeviceCount"]);
    }

    #[test]
    fn a_one_metric_device_keeps_its_metrics_key_so_stored_sensors_stay_valid() {
        for key in ["temperature", "airQuality", "peopleCount"] {
            let device = super::devices()
                .into_iter()
                .find(|device| device.key == key)
                .unwrap_or_else(|| panic!("no device {key}"));
            assert_eq!(device.metrics, [key]);
        }
    }

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
