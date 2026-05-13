use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use log::info;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::state::AppState;

// The payload sent by the client containing the columns they want to subscribe to.
#[derive(Deserialize)]
pub struct UpdatePreferencesRequest {
    pub allowed_columns: Vec<String>,
}

// The response confirming the rules have been updated.
#[derive(Serialize)]
pub struct UpdatePreferencesResponse {
    pub status: String,
    pub building_id: String,
    pub active_columns: usize,
}

// POST /metrics/preferences/:building_id
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

    info!(
        "Updated telemetry routing bounds for client: {}",
        building_id
    );

    // Asynchronous Database Persistence (The Cold Path)
    // Spawn a fire-and-forget Tokio task to handle the I/O bottleneck of database writes.
    // This allows the HTTP request to terminate and return 200 OK immediately.
    tokio::spawn(async move {
        // TODO: Insert your actual database execution block here.
        // let result = db::upsert_client_schema(&building_id, &payload.allowed_columns).await;
        //
        // if let Err(e) = result {
        //     error!("CRITICAL: Failed to persist schema bounds for {}: {}", client_id, e);
        // } else {
        //     info!("Successfully persisted schema bounds to database for {}", client_id);
        // }
    });

    // Acknowledge the update instantly
    let response = UpdatePreferencesResponse {
        status: "success".to_string(),
        building_id: building_id,
        active_columns: column_count,
    };

    (StatusCode::OK, Json(response))
}
