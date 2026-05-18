use axum::{
    extract::{Path, State},
    http::StatusCode,
};
use crate::state::AppState;

const DEFAULT_COLUMNS: &[&str] = &["roomName", "roomMaxOccupancy"];

pub async fn init_building_preferences(
    Path(building_id): Path<String>,
    State(state): State<AppState>,
) -> StatusCode {
    state.building_preferences
        .entry(building_id)
        .or_insert_with(|| DEFAULT_COLUMNS.iter().map(|s| s.to_string()).collect());
    StatusCode::OK
}
