use dashmap::DashMap;
use mongodb::Collection;
use std::sync::Arc;

use crate::models::PreferenceDocument;

#[derive(Clone)]
pub struct AppState {
    // Maps a Building ID to a list of allowed metric keys.
    // Arc is used because Axum's State extractor requires the struct to be Clone.
    pub building_preferences: Arc<DashMap<String, Vec<String>>>,
    // Typed handle to the MongoDB preferences collection.
    // Collection<T> is Arc-backed internally, so Clone is cheap.
    pub mongo_col: Collection<PreferenceDocument>,
}

impl AppState {
    pub fn new(mongo_col: Collection<PreferenceDocument>) -> Self {
        Self {
            building_preferences: Arc::new(DashMap::new()),
            mongo_col,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppState;
    use crate::models::PreferenceDocument;

    async fn make_state() -> AppState {
        let opts = mongodb::options::ClientOptions::parse("mongodb://localhost:27017")
            .await
            .unwrap();
        let client = mongodb::Client::with_options(opts).unwrap();
        let col = client
            .database("_unit_test")
            .collection::<PreferenceDocument>("_prefs");
        AppState::new(col)
    }

    #[tokio::test]
    async fn new_state_has_empty_preferences() {
        let state = make_state().await;
        assert!(state.building_preferences.is_empty());
    }

    #[tokio::test]
    async fn inserted_entry_is_readable_back() {
        let state = make_state().await;
        state
            .building_preferences
            .insert("bldg-1".to_string(), vec!["temperature".to_string()]);

        let entry = state.building_preferences.get("bldg-1").unwrap();
        assert_eq!(*entry, vec!["temperature"]);
    }

    #[tokio::test]
    async fn missing_key_returns_none() {
        let state = make_state().await;
        assert!(state.building_preferences.get("nonexistent").is_none());
    }

    #[tokio::test]
    async fn two_instances_do_not_share_state() {
        let state_a = make_state().await;
        let state_b = make_state().await;

        state_a
            .building_preferences
            .insert("bldg-1".to_string(), vec![]);

        // state_b is independent — inserting into state_a must not affect it.
        assert!(state_b.building_preferences.get("bldg-1").is_none());
    }

    #[tokio::test]
    async fn clone_shares_the_same_underlying_map() {
        // AppState::clone() is a shallow clone (Arc), so both handles see the same data.
        let state = make_state().await;
        let cloned = state.clone();

        state
            .building_preferences
            .insert("bldg-x".to_string(), vec!["col".to_string()]);

        assert!(cloned.building_preferences.get("bldg-x").is_some());
    }
}
