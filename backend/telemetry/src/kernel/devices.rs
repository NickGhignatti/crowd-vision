use crate::kernel::registry::PluginRegistry;
use crate::types::device::DeviceKind;

/// The device kinds a sensor may be registered as, checked against the metric plugins.
pub struct DeviceCatalog {
    devices: Vec<DeviceKind>,
}

impl DeviceCatalog {
    /// Every device key distinct, every metric real, and every metric reported by exactly one
    /// device — otherwise a reading could not be traced to the kind of thing that sent it.
    pub fn new(devices: Vec<DeviceKind>, registry: &PluginRegistry) -> Result<Self, String> {
        for (index, device) in devices.iter().enumerate() {
            if devices[..index].iter().any(|d| d.key == device.key) {
                return Err(format!("duplicate device kind: {}", device.key));
            }
            if let Some(metric) = device.metrics.iter().find(|m| registry.get(m).is_none()) {
                return Err(format!(
                    "device {} reports unknown metric {metric}",
                    device.key
                ));
            }
        }
        for plugin in registry.all() {
            let owners = devices
                .iter()
                .filter(|device| device.metrics.contains(&plugin.key()))
                .count();
            if owners != 1 {
                return Err(format!(
                    "metric {} is reported by {owners} device kinds, not exactly one",
                    plugin.key()
                ));
            }
        }
        Ok(Self { devices })
    }

    pub fn get(&self, key: &str) -> Option<&DeviceKind> {
        self.devices.iter().find(|device| device.key == key)
    }

    pub fn all(&self) -> &[DeviceKind] {
        &self.devices
    }

    /// Every action any of the device's metrics declares, sorted and without repeats.
    pub fn actions_of(&self, key: &str, registry: &PluginRegistry) -> Vec<&'static str> {
        let mut actions: Vec<&'static str> = self
            .get(key)
            .into_iter()
            .flat_map(|device| device.metrics.iter())
            .filter_map(|metric| registry.get(metric))
            .flat_map(|plugin| plugin.actions().iter().map(|action| action.name))
            .collect();
        actions.sort_unstable();
        actions.dedup();
        actions
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::FakePlugin;
    use crate::kernel::registry::PluginRegistry;
    use crate::types::device::DeviceKind;

    fn registry(keys: &[&'static str]) -> PluginRegistry {
        PluginRegistry::new(
            keys.iter()
                .map(|&key| Box::new(FakePlugin { key }) as Box<_>)
                .collect(),
        )
        .unwrap()
    }

    const fn device(key: &'static str, metrics: &'static [&'static str]) -> DeviceKind {
        DeviceKind {
            key,
            label: key,
            metrics,
        }
    }

    #[test]
    fn a_catalog_covering_every_metric_once_is_accepted() {
        let catalog = DeviceCatalog::new(
            vec![
                device("router", &["total", "ratio"]),
                device("thermostat", &["temp"]),
            ],
            &registry(&["total", "ratio", "temp"]),
        )
        .unwrap();
        assert_eq!(catalog.get("router").unwrap().metrics, ["total", "ratio"]);
        assert!(catalog.get("total").is_none());
    }

    #[test]
    fn a_device_naming_an_unknown_metric_is_rejected() {
        let error = DeviceCatalog::new(
            vec![device("router", &["total", "missing"])],
            &registry(&["total"]),
        )
        .err()
        .unwrap();
        assert!(error.contains("missing"), "{error}");
    }

    #[test]
    fn a_metric_no_device_produces_is_rejected() {
        let error = DeviceCatalog::new(
            vec![device("router", &["total"])],
            &registry(&["total", "orphan"]),
        )
        .err()
        .unwrap();
        assert!(error.contains("orphan"), "{error}");
    }

    #[test]
    fn a_metric_two_devices_produce_is_rejected() {
        let error = DeviceCatalog::new(
            vec![device("a", &["total"]), device("b", &["total"])],
            &registry(&["total"]),
        )
        .err()
        .unwrap();
        assert!(error.contains("total"), "{error}");
    }

    #[test]
    fn two_devices_sharing_a_key_are_rejected() {
        let error = DeviceCatalog::new(
            vec![device("router", &["total"]), device("router", &["ratio"])],
            &registry(&["total", "ratio"]),
        )
        .err()
        .unwrap();
        assert!(error.contains("router"), "{error}");
    }

    #[test]
    fn a_device_offers_every_action_its_metrics_declare_once() {
        // FakePlugin declares setTarget and increase for every key.
        let registry = registry(&["total", "ratio"]);
        let catalog =
            DeviceCatalog::new(vec![device("router", &["total", "ratio"])], &registry).unwrap();
        assert_eq!(
            catalog.actions_of("router", &registry),
            ["increase", "setTarget"]
        );
        assert!(catalog.actions_of("unknown", &registry).is_empty());
    }
}
