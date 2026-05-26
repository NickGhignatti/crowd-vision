use crate::state::AppState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
};

const DEFAULT_COLUMNS: &[&str] = &["roomName", "roomMaxOccupancy"];

pub async fn init_building_preferences(
    Path(building_id): Path<String>,
    State(state): State<AppState>,
) -> StatusCode {
    state
        .building_preferences
        .entry(building_id)
        .or_insert_with(|| DEFAULT_COLUMNS.iter().map(|s| s.to_string()).collect());
    StatusCode::OK
}

#[cfg(test)]
mod tests {
    use super::{DEFAULT_COLUMNS, init_building_preferences};
    use crate::state::AppState;
    use axum::extract::{Path, State};
    use axum::http::StatusCode;

    #[tokio::test]
    async fn new_building_receives_default_columns() {
        let state = AppState::new();
        let status =
            init_building_preferences(Path("bldg-1".to_string()), State(state.clone())).await;

        assert_eq!(status, StatusCode::OK);
        let cols = state.building_preferences.get("bldg-1").unwrap();
        assert!(cols.contains(&"roomName".to_string()));
        assert!(cols.contains(&"roomMaxOccupancy".to_string()));
        assert_eq!(cols.len(), DEFAULT_COLUMNS.len());
    }

    #[tokio::test]
    async fn second_init_for_same_building_is_idempotent() {
        let state = AppState::new();
        // Pre-populate with a custom column set.
        state
            .building_preferences
            .insert("bldg-1".to_string(), vec!["custom-col".to_string()]);

        // init should not overwrite an existing entry.
        init_building_preferences(Path("bldg-1".to_string()), State(state.clone())).await;

        let cols = state.building_preferences.get("bldg-1").unwrap();
        assert_eq!(*cols, vec!["custom-col"]);
    }

    #[tokio::test]
    async fn two_buildings_are_initialised_independently() {
        let state = AppState::new();
        init_building_preferences(Path("bldg-a".to_string()), State(state.clone())).await;
        init_building_preferences(Path("bldg-b".to_string()), State(state.clone())).await;

        assert!(state.building_preferences.contains_key("bldg-a"));
        assert!(state.building_preferences.contains_key("bldg-b"));
        assert_eq!(state.building_preferences.len(), 2);
    }

    #[tokio::test]
    async fn default_columns_contain_exactly_room_name_and_max_occupancy() {
        // Validates the constant itself, not just that the handler stores something.
        assert!(DEFAULT_COLUMNS.contains(&"roomName"));
        assert!(DEFAULT_COLUMNS.contains(&"roomMaxOccupancy"));
        assert_eq!(DEFAULT_COLUMNS.len(), 2);
    }
}
