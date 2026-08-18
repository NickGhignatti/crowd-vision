use crate::contracts::error::DomainError;
use crate::contracts::plugin::SensorPlugin;
use crate::contracts::threshold::{Bounds, TemperatureLimits};
use crate::kernel::ports::ThresholdStore;
use crate::kernel::registry::PluginRegistry;
use std::sync::Arc;

pub struct Thresholds {
    pub registry: Arc<PluginRegistry>,
    pub store: Arc<dyn ThresholdStore>,
}

impl Thresholds {
    fn plugin(&self, metric: &str) -> Result<&dyn SensorPlugin, DomainError> {
        self.registry
            .get(metric)
            .ok_or_else(|| DomainError::NotFound(format!("unknown sensor type: {metric}")))
    }

    fn checked<'a>(
        &'a self,
        metric: &str,
        patch: &Bounds,
    ) -> Result<&'a dyn SensorPlugin, DomainError> {
        let plugin = self.plugin(metric)?;
        for (key, value) in patch {
            if !plugin.bounds().iter().any(|bound| bound.key == key) {
                return Err(DomainError::Validation(format!(
                    "{key}: not a bound of {metric}."
                )));
            }
            if value.as_f64().is_none() {
                return Err(DomainError::Validation(format!(
                    "{key}: must be a finite number."
                )));
            }
        }
        Ok(plugin)
    }

    pub async fn get_building_threshold_by_metric(
        &self,
        metric: &str,
        building_id: &str,
    ) -> Result<Option<Bounds>, DomainError> {
        self.plugin(metric)?;
        Ok(self.store.building_bounds(building_id, metric).await?)
    }

    pub async fn update_building(
        &self,
        metric: &str,
        building_id: &str,
        patch: &Bounds,
    ) -> Result<Bounds, DomainError> {
        self.checked(metric, patch)?;
        Ok(self.store.upsert(building_id, None, metric, patch).await?)
    }

    pub async fn update_room(
        &self,
        metric: &str,
        building_id: &str,
        room_id: &str,
        patch: &Bounds,
    ) -> Result<Bounds, DomainError> {
        self.checked(metric, patch)?;
        Ok(self
            .store
            .upsert(building_id, Some(room_id), metric, patch)
            .await?)
    }

    pub async fn temperature_limits(
        &self,
        building_id: &str,
    ) -> Result<Option<TemperatureLimits>, DomainError> {
        Ok(self.store.temperature_limits(building_id).await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakePlugin, FakeThresholds, row};
    use serde_json::json;

    struct Harness {
        store: Arc<FakeThresholds>,
        thresholds: Thresholds,
    }

    fn harness(store: FakeThresholds) -> Harness {
        let store = Arc::new(store);
        let registry =
            Arc::new(PluginRegistry::new(vec![Box::new(FakePlugin::default())]).unwrap());
        let thresholds = Thresholds {
            registry,
            store: store.clone() as Arc<dyn ThresholdStore>,
        };
        Harness { store, thresholds }
    }

    fn bounds(value: serde_json::Value) -> Bounds {
        value.as_object().cloned().unwrap()
    }

    #[tokio::test]
    async fn updating_a_room_threshold_is_readable_back_at_room_scope() {
        let h = harness(FakeThresholds::default());
        h.thresholds
            .update_room("fake", "b1", "r1", &bounds(json!({ "maxFake": 30.0 })))
            .await
            .unwrap();
        let resolved = h.store.resolve("b1", "fake", "r1").await.unwrap().unwrap();
        assert_eq!(resolved["maxFake"], 30.0);
    }

    #[tokio::test]
    async fn updating_a_room_threshold_leaves_the_building_threshold_untouched() {
        let h = harness(FakeThresholds::with(vec![row(
            "b1",
            None,
            "fake",
            json!({ "maxFake": 25.0 }),
        )]));
        h.thresholds
            .update_room("fake", "b1", "r1", &bounds(json!({ "maxFake": 30.0 })))
            .await
            .unwrap();
        let building = h
            .thresholds
            .get_building_threshold_by_metric("fake", "b1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(building["maxFake"], 25.0);
        let other_room = h.store.resolve("b1", "fake", "r9").await.unwrap().unwrap();
        assert_eq!(other_room["maxFake"], 25.0);
    }

    #[tokio::test]
    async fn updating_a_building_threshold_upserts_when_no_row_exists() {
        let h = harness(FakeThresholds::default());
        assert!(
            h.thresholds
                .get_building_threshold_by_metric("fake", "b1")
                .await
                .unwrap()
                .is_none()
        );
        let stored = h
            .thresholds
            .update_building("fake", "b1", &bounds(json!({ "maxFake": 25.0 })))
            .await
            .unwrap();
        assert_eq!(stored["maxFake"], 25.0);
        assert_eq!(
            h.thresholds
                .get_building_threshold_by_metric("fake", "b1")
                .await
                .unwrap()
                .unwrap()["maxFake"],
            25.0
        );
    }

    #[tokio::test]
    async fn an_update_merges_into_the_bounds_already_stored() {
        let h = harness(FakeThresholds::with(vec![row(
            "b1",
            None,
            "fake",
            json!({ "maxFake": 25.0 }),
        )]));
        let stored = h
            .thresholds
            .update_building("fake", "b1", &bounds(json!({ "minFake": 18.0 })))
            .await
            .unwrap();
        assert_eq!(stored["maxFake"], 25.0);
        assert_eq!(stored["minFake"], 18.0);
    }

    #[tokio::test]
    async fn an_unknown_sensor_type_is_not_found() {
        let h = harness(FakeThresholds::default());
        assert!(matches!(
            h.thresholds
                .get_building_threshold_by_metric("humidity", "b1")
                .await
                .unwrap_err(),
            DomainError::NotFound(_)
        ));
        assert!(matches!(
            h.thresholds
                .update_building("humidity", "b1", &bounds(json!({ "maxFake": 1.0 })))
                .await
                .unwrap_err(),
            DomainError::NotFound(_)
        ));
        assert!(h.store.rows.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_bound_key_the_plugin_does_not_declare_is_rejected() {
        let h = harness(FakeThresholds::default());
        let error = h
            .thresholds
            .update_building("fake", "b1", &bounds(json!({ "maxTemp": 25.0 })))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.store.rows.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_non_numeric_bound_is_rejected() {
        let h = harness(FakeThresholds::default());
        let error = h
            .thresholds
            .update_room("fake", "b1", "r1", &bounds(json!({ "maxFake": "hot" })))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.store.rows.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn the_temperature_limits_report_registered_rooms_even_when_they_have_no_bounds() {
        let h = harness(FakeThresholds {
            rows: std::sync::Mutex::new(vec![row(
                "b1",
                None,
                "temperature",
                json!({ "maxTemp": 25.0 }),
            )]),
            rooms: vec!["r1".to_owned(), "r2".to_owned()],
            refuse: false,
        });
        let view = h
            .thresholds
            .temperature_limits("b1")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(view.max_temperature, Some(25.0));
        assert_eq!(view.rooms.len(), 2);
        assert_eq!(view.rooms[0].room_id, "r1");
        assert_eq!(view.rooms[0].max_temperature, None);
    }

    #[tokio::test]
    async fn the_temperature_limits_of_an_unregistered_building_are_absent() {
        let h = harness(FakeThresholds::default());
        assert!(
            h.thresholds
                .temperature_limits("b1")
                .await
                .unwrap()
                .is_none()
        );
    }
}
