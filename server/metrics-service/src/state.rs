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
