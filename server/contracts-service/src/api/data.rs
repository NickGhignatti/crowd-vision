use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

use crate::infra::db;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct UpdatePreferencesRequest {
    pub allowed_columns: Vec<String>,
}

#[derive(Serialize)]
pub struct UpdatePreferencesResponse {
    pub status: String,
    pub building_id: String,
    pub active_columns: usize,
}

#[derive(Serialize)]
pub struct GetPreferencesResponse {
    pub building_id: String,
    pub allowed_columns: Vec<String>,
}

// GET /preferences/:building_id
pub async fn get_preferences(
    Path(building_id): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    match state.building_preferences.get(&building_id) {
        Some(columns) => (
            StatusCode::OK,
            Json(GetPreferencesResponse {
                building_id,
                allowed_columns: columns.clone(),
            }),
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

// POST /preferences/:building_id
pub async fn update_preferences(
    State(state): State<AppState>,
    Path(building_id): Path<String>,
    Json(payload): Json<UpdatePreferencesRequest>,
) -> impl IntoResponse {
    let column_count = payload.allowed_columns.len();

    // Instant Cache Mutation (The Hot Path)
    // DashMap shards its internal locks, meaning this write operation will virtually
    // never experience lock contention with the Redis tunnel's read operations.
    // The telemetry loop running in the background will pick up these new bounds on its very next iteration.
    state
        .building_preferences
        .insert(building_id.clone(), payload.allowed_columns.clone());

    // Asynchronous Database Persistence (The Cold Path)
    // Spawn a fire-and-forget Tokio task to handle the I/O bottleneck of database writes.
    // This allows the HTTP request to terminate and return 200 OK immediately.
    let col = state.mongo_col.clone();
    let bid = building_id.clone();
    tokio::spawn(async move {
        if let Err(e) = db::upsert_preference(&col, &bid, &payload.allowed_columns).await {
            log::error!("Failed to persist preference for {bid}: {e}");
        }
    });

    // Acknowledge the update instantly
    let response = UpdatePreferencesResponse {
        status: "success".to_string(),
        building_id,
        active_columns: column_count,
    };

    (StatusCode::OK, Json(response))
}

#[cfg(test)]
mod tests {
    use super::{UpdatePreferencesRequest, get_preferences, update_preferences};
    use crate::models::PreferenceDocument;
    use crate::state::AppState;
    use axum::Json;
    use axum::extract::{Path, State};
    use axum::http::StatusCode;
    use axum::response::IntoResponse;

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

    // ── get_preferences ───────────────────────────────────────────────────────

    #[tokio::test]
    async fn get_returns_404_for_unknown_building() {
        let state = make_state().await;
        let response = get_preferences(Path("unknown".to_string()), State(state))
            .await
            .into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn get_returns_200_after_insert() {
        let state = make_state().await;
        state
            .building_preferences
            .insert("bldg-1".to_string(), vec!["temperature".to_string()]);

        let response = get_preferences(Path("bldg-1".to_string()), State(state))
            .await
            .into_response();
        assert_eq!(response.status(), StatusCode::OK);
    }

    // ── update_preferences ────────────────────────────────────────────────────

    #[tokio::test]
    async fn update_stores_new_columns_in_dashmap() {
        let state = make_state().await;
        update_preferences(
            State(state.clone()),
            Path("bldg-1".to_string()),
            Json(UpdatePreferencesRequest {
                allowed_columns: vec!["temperature".to_string()],
            }),
        )
        .await;

        let cols = state.building_preferences.get("bldg-1").unwrap();
        assert_eq!(*cols, vec!["temperature"]);
    }

    #[tokio::test]
    async fn update_overwrites_previous_columns() {
        let state = make_state().await;
        state
            .building_preferences
            .insert("bldg-1".to_string(), vec!["old-col".to_string()]);

        update_preferences(
            State(state.clone()),
            Path("bldg-1".to_string()),
            Json(UpdatePreferencesRequest {
                allowed_columns: vec!["new-col".to_string()],
            }),
        )
        .await;

        let cols = state.building_preferences.get("bldg-1").unwrap();
        assert_eq!(*cols, vec!["new-col"]);
    }

    #[tokio::test]
    async fn update_stores_empty_column_list() {
        let state = make_state().await;
        update_preferences(
            State(state.clone()),
            Path("bldg-1".to_string()),
            Json(UpdatePreferencesRequest {
                allowed_columns: vec![],
            }),
        )
        .await;

        let cols = state.building_preferences.get("bldg-1").unwrap();
        assert!(cols.is_empty());
    }

    #[tokio::test]
    async fn update_returns_200_ok() {
        let state = make_state().await;
        let response = update_preferences(
            State(state),
            Path("bldg-1".to_string()),
            Json(UpdatePreferencesRequest {
                allowed_columns: vec!["temperature".to_string()],
            }),
        )
        .await
        .into_response();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
