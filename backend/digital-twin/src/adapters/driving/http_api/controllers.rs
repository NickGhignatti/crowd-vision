use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use uuid::Uuid;

use crate::domain::identity::GatewayClaims;
use crate::domain::{
    Building, DimensionsInput, DomainError, PositionInput, Room, normalize_building_name,
    normalize_room_name, validate_capacity,
};
use crate::service::buildings::BuildingPatch;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct RoomWireInput {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub capacity: Option<f64>,
    pub position: PositionInput,
    pub dimensions: DimensionsInput,
    #[serde(default)]
    pub color: Option<String>,
}

impl RoomWireInput {
    fn into_room(self) -> Result<Room, DomainError> {
        let position = self.position.to_coordinates()?;
        let dimensions = self.dimensions.to_dimensions()?;
        let capacity = validate_capacity(self.capacity)?;
        let name = normalize_room_name(self.name.as_deref(), &self.id);
        Ok(Room {
            id: self.id,
            name,
            capacity,
            position,
            dimensions,
            color: self.color,
        })
    }
}

#[derive(Deserialize)]
pub struct RegisterBuildingRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub rooms: Vec<RoomWireInput>,
    #[serde(default)]
    pub domains: Vec<String>,
}

pub async fn add_building(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<RegisterBuildingRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), DomainError> {
    let rooms = body
        .rooms
        .into_iter()
        .map(RoomWireInput::into_room)
        .collect::<Result<Vec<_>, _>>()?;

    let building = Building {
        id: Uuid::new_v4().to_string(),
        name: normalize_building_name(body.name.as_deref(), None),
        rooms,
        domains: body.domains,
    };
    let handle = state.provisioning.accept(building, &claims.raw).await?;

    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({ "buildingId": handle })),
    ))
}

pub async fn get_upload_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _claims: GatewayClaims,
) -> Result<Json<serde_json::Value>, DomainError> {
    let status = state.provisioning.status(&id).await?;
    Ok(Json(serde_json::json!({ "status": status })))
}

pub async fn get_building_by_id(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _claims: GatewayClaims,
) -> Result<Json<Building>, DomainError> {
    Ok(Json(state.buildings.get(&id).await?))
}

pub async fn get_building_by_domain(
    State(state): State<AppState>,
    Path(domain): Path<String>,
    claims: GatewayClaims,
) -> Result<Json<Vec<Building>>, DomainError> {
    Ok(Json(
        state.buildings.list_for_domain(&domain, &claims).await?,
    ))
}

#[derive(Deserialize)]
pub struct GetCountsRequest {
    domains: serde_json::Value,
}

pub async fn get_building_counts(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<GetCountsRequest>,
) -> Result<Json<serde_json::Value>, DomainError> {
    let bad_shape = || DomainError::Validation("'domains' must be an array of strings".to_string());
    let items = body.domains.as_array().ok_or_else(bad_shape)?;
    let mut domains = Vec::with_capacity(items.len());
    for item in items {
        domains.push(item.as_str().ok_or_else(bad_shape)?.to_string());
    }

    let counts = state.buildings.counts_per_domain(&domains, &claims).await?;
    Ok(Json(serde_json::json!({ "counts": counts })))
}

pub async fn get_domains_by_building(
    State(state): State<AppState>,
    Path(building): Path<String>,
    _claims: GatewayClaims,
) -> Result<Json<Vec<String>>, DomainError> {
    Ok(Json(state.buildings.domains_of(&building).await?))
}

#[derive(Deserialize)]
pub struct UpdateBuildingRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub domains: Option<Vec<String>>,
    #[serde(default, rename = "maxTemperature")]
    pub max_temperature: Option<f64>,
}

pub async fn resync_building(
    State(state): State<AppState>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
) -> Result<StatusCode, DomainError> {
    state.provisioning.resync(&building_id, &claims).await?;
    Ok(StatusCode::ACCEPTED)
}

pub async fn update_building(
    State(state): State<AppState>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
    Json(body): Json<UpdateBuildingRequest>,
) -> Result<Json<Building>, DomainError> {
    let patch = BuildingPatch {
        name: body.name,
        domains: body.domains,
        max_temperature: body.max_temperature,
    };
    Ok(Json(
        state.buildings.update(&building_id, patch, &claims).await?,
    ))
}
