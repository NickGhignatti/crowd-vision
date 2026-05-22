use dashmap::DashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    // Maps a Building ID to a list of allowed metric keys.
    // Arc is used because Axum's State extractor requires the struct to be Clone.
    pub building_preferences: Arc<DashMap<String, Vec<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        let preferences = DashMap::new();
        Self {
            building_preferences: Arc::new(preferences),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppState;

    #[test]
    fn new_state_has_empty_preferences() {
        let state = AppState::new();
        assert!(state.building_preferences.is_empty());
    }

    #[test]
    fn inserted_entry_is_readable_back() {
        let state = AppState::new();
        state
            .building_preferences
            .insert("bldg-1".to_string(), vec!["temperature".to_string()]);

        let entry = state.building_preferences.get("bldg-1").unwrap();
        assert_eq!(*entry, vec!["temperature"]);
    }

    #[test]
    fn missing_key_returns_none() {
        let state = AppState::new();
        assert!(state.building_preferences.get("nonexistent").is_none());
    }

    #[test]
    fn two_instances_do_not_share_state() {
        let state_a = AppState::new();
        let state_b = AppState::new();

        state_a
            .building_preferences
            .insert("bldg-1".to_string(), vec![]);

        // state_b is independent — inserting into state_a must not affect it.
        assert!(state_b.building_preferences.get("bldg-1").is_none());
    }

    #[test]
    fn clone_shares_the_same_underlying_map() {
        // AppState::clone() is a shallow clone (Arc), so both handles see the same data.
        let state = AppState::new();
        let cloned = state.clone();

        state
            .building_preferences
            .insert("bldg-x".to_string(), vec!["col".to_string()]);

        assert!(cloned.building_preferences.get("bldg-x").is_some());
    }
}
