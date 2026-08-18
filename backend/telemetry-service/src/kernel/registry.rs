use crate::contracts::plugin::SensorPlugin;

pub struct PluginRegistry {
    plugins: Vec<Box<dyn SensorPlugin>>,
}

impl PluginRegistry {
    pub fn new(plugins: Vec<Box<dyn SensorPlugin>>) -> Result<Self, String> {
        for (index, plugin) in plugins.iter().enumerate() {
            if plugins[..index].iter().any(|p| p.key() == plugin.key()) {
                return Err(format!("duplicate plugin key: {}", plugin.key()));
            }
        }
        Ok(Self { plugins })
    }

    pub fn get(&self, key: &str) -> Option<&dyn SensorPlugin> {
        self.plugins
            .iter()
            .find(|p| p.key() == key)
            .map(|p| p.as_ref())
    }

    pub fn all(&self) -> &[Box<dyn SensorPlugin>] {
        &self.plugins
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::FakePlugin;

    fn fake(key: &'static str) -> Box<dyn SensorPlugin> {
        Box::new(FakePlugin { key })
    }

    #[test]
    fn an_empty_registry_serves_no_metrics() {
        let registry = PluginRegistry::new(vec![]).unwrap();
        assert!(registry.all().is_empty());
    }

    #[test]
    fn a_registered_plugin_is_found_by_its_key() {
        let registry = PluginRegistry::new(vec![fake("temperature")]).unwrap();
        assert_eq!(registry.get("temperature").unwrap().key(), "temperature");
    }

    #[test]
    fn lookup_of_an_unknown_metric_key_returns_none() {
        let registry = PluginRegistry::new(vec![fake("temperature")]).unwrap();
        assert!(registry.get("humidity").is_none());
    }

    #[test]
    fn a_registry_built_with_two_plugins_sharing_a_key_is_rejected() {
        let error = PluginRegistry::new(vec![fake("temperature"), fake("temperature")])
            .err()
            .unwrap();
        assert!(error.contains("temperature"));
    }

    #[test]
    fn every_registered_plugin_is_served() {
        let registry = PluginRegistry::new(vec![fake("temperature"), fake("peopleCount")]).unwrap();
        assert_eq!(registry.all().len(), 2);
    }
}
