use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::Deserialize;
use std::collections::HashSet;
use uuid::Uuid;

use crate::infra::claims::GatewayClaims;
use crate::infra::{authz, db, outbound};
use crate::models::{
    AppError, Building, DimensionsInput, PositionInput, Room, normalize_building_name,
    normalize_room_name, validate_capacity,
};
use crate::state::AppState;

const MAX_DOMAIN_NAMES: usize = 500;

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
    fn into_room(self) -> Result<Room, AppError> {
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

// Loads a building by its app-level id (not Mongo's _id), backfilling blank
// names as a side effect -- mirrors twin-service's single `getBuildingById`
// service function, which every route (including the edit-authorization
// check below) routes through, so a load anywhere in the app always
// self-heals blank names.
async fn load_building(state: &AppState, id: &str) -> Result<Building, AppError> {
    let building = db::find_by_id(&state.buildings, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Building with id: \"{id}\" not found")))?;
    backfill_names(state, building).await
}

async fn backfill_names(state: &AppState, mut building: Building) -> Result<Building, AppError> {
    let mut changed = false;

    let normalized_name = normalize_building_name(Some(&building.name), Some(&building.id));
    if normalized_name != building.name {
        building.name = normalized_name;
        changed = true;
    }
    for room in &mut building.rooms {
        let normalized_room_name = normalize_room_name(Some(&room.name), &room.id);
        if normalized_room_name != room.name {
            room.name = normalized_room_name;
            changed = true;
        }
    }

    if changed {
        db::replace(&state.buildings, &building).await?;
    }
    Ok(building)
}

// Shared by every geometry-mutating route: confirms the caller holds an
// editing role in one of the target building's own domains, not just any
// domain membership.
fn assert_can_edit(claims: &GatewayClaims, building: &Building) -> Result<(), AppError> {
    if !authz::can_edit_domains(claims, &building.domains) {
        return Err(AppError::Forbidden(
            "Requires an editing role in one of this building's domains".to_string(),
        ));
    }
    Ok(())
}

pub async fn add_building(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<RegisterBuildingRequest>,
) -> Result<(StatusCode, Json<Building>), AppError> {
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
    db::insert(&state.buildings, &building).await?;

    outbound::sync_building_clone(&state.outbound, &building, None, Some(&claims.raw)).await?;
    outbound::init_building_preferences(&state.outbound, &building.id, Some(&claims.raw)).await;

    Ok((StatusCode::CREATED, Json(building)))
}

pub async fn get_building_by_id(
    State(state): State<AppState>,
    Path(id): Path<String>,
    _claims: GatewayClaims,
) -> Result<Json<Building>, AppError> {
    Ok(Json(load_building(&state, &id).await?))
}

pub async fn get_building_by_domain(
    State(state): State<AppState>,
    Path(domain): Path<String>,
    claims: GatewayClaims,
) -> Result<Json<Vec<Building>>, AppError> {
    if !authz::is_member_of(&claims, &domain) {
        return Err(AppError::Forbidden(
            "Not a member of this domain".to_string(),
        ));
    }
    let buildings = db::find_by_domain(&state.buildings, &domain).await?;
    let mut backfilled = Vec::with_capacity(buildings.len());
    for building in buildings {
        backfilled.push(backfill_names(&state, building).await?);
    }
    Ok(Json(backfilled))
}

#[derive(Deserialize)]
pub struct GetCountsRequest {
    domains: serde_json::Value,
}

pub async fn get_building_counts(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<GetCountsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let bad_shape = || AppError::Validation("'domains' must be an array of strings".to_string());
    let items = body.domains.as_array().ok_or_else(bad_shape)?;
    let mut domains = Vec::with_capacity(items.len());
    for item in items {
        domains.push(item.as_str().ok_or_else(bad_shape)?.to_string());
    }

    if domains.len() > MAX_DOMAIN_NAMES {
        return Err(AppError::Validation(format!(
            "Too many domains requested (max {MAX_DOMAIN_NAMES})"
        )));
    }

    let scoped = authz::scope_to_memberships(&domains, &claims);
    let counts = db::counts_by_domain(&state.buildings, &scoped).await?;
    Ok(Json(serde_json::json!({ "counts": counts })))
}

pub async fn get_domains_by_building(
    State(state): State<AppState>,
    Path(building_name): Path<String>,
    _claims: GatewayClaims,
) -> Result<Json<Vec<String>>, AppError> {
    let buildings = db::find_by_name(&state.buildings, &building_name).await?;
    let domains = buildings.into_iter().flat_map(|b| b.domains).collect();
    Ok(Json(domains))
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

pub async fn update_building(
    State(state): State<AppState>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
    Json(body): Json<UpdateBuildingRequest>,
) -> Result<Json<Building>, AppError> {
    let mut building = load_building(&state, &building_id).await?;
    assert_can_edit(&claims, &building)?;

    if let Some(name) = body.name {
        building.name = name;
    }
    if let Some(domains) = body.domains {
        building.domains = domains;
    }
    db::replace(&state.buildings, &building).await?;

    outbound::sync_building_clone(
        &state.outbound,
        &building,
        body.max_temperature,
        Some(&claims.raw),
    )
    .await?;

    Ok(Json(building))
}

#[derive(Deserialize)]
pub struct UpdateRoomRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub capacity: Option<f64>,
    #[serde(default)]
    pub position: Option<PositionInput>,
    #[serde(default)]
    pub dimensions: Option<DimensionsInput>,
}

pub async fn update_room(
    State(state): State<AppState>,
    Path((building_id, room_id)): Path<(String, String)>,
    claims: GatewayClaims,
    Json(body): Json<UpdateRoomRequest>,
) -> Result<Json<Room>, AppError> {
    let mut building = load_building(&state, &building_id).await?;
    assert_can_edit(&claims, &building)?;

    // Validate before mutating, so a bad update never leaves the room
    // half-written.
    let position = body
        .position
        .as_ref()
        .map(PositionInput::to_coordinates)
        .transpose()?;
    let dimensions = body
        .dimensions
        .as_ref()
        .map(DimensionsInput::to_dimensions)
        .transpose()?;

    let room = building
        .rooms
        .iter_mut()
        .find(|r| r.id == room_id)
        .ok_or_else(|| {
            AppError::NotFound(format!(
                "Room with id \"{room_id}\" in the building \"{building_id}\" not found"
            ))
        })?;

    if let Some(name) = body.name {
        room.name = name;
    }
    if let Some(color) = body.color {
        room.color = Some(color);
    }
    if let Some(capacity) = body.capacity {
        room.capacity = capacity;
    }
    if let Some(position) = position {
        room.position = position;
    }
    if let Some(dimensions) = dimensions {
        room.dimensions = dimensions;
    }
    let updated_room = room.clone();

    db::replace(&state.buildings, &building).await?;
    outbound::sync_building_clone(&state.outbound, &building, None, Some(&claims.raw)).await?;

    Ok(Json(updated_room))
}

#[derive(Deserialize)]
pub struct CreateRoomRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub capacity: Option<f64>,
    pub position: PositionInput,
    pub dimensions: DimensionsInput,
    #[serde(default)]
    pub color: Option<String>,
}

pub async fn create_room(
    State(state): State<AppState>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
    Json(body): Json<CreateRoomRequest>,
) -> Result<(StatusCode, Json<Room>), AppError> {
    let mut building = load_building(&state, &building_id).await?;
    assert_can_edit(&claims, &building)?;

    let position = body.position.to_coordinates()?;
    let dimensions = body.dimensions.to_dimensions()?;
    let capacity = validate_capacity(body.capacity)?;

    let id = Uuid::new_v4().to_string();
    let room = Room {
        name: normalize_room_name(body.name.as_deref(), &id),
        id,
        capacity,
        position,
        dimensions,
        color: body.color,
    };
    building.rooms.push(room.clone());
    db::replace(&state.buildings, &building).await?;
    outbound::sync_building_clone(&state.outbound, &building, None, Some(&claims.raw)).await?;
    outbound::init_room_thresholds(
        &state.outbound,
        &building_id,
        &room.id,
        room.capacity,
        Some(&claims.raw),
    )
    .await;

    Ok((StatusCode::CREATED, Json(room)))
}

pub async fn delete_room(
    State(state): State<AppState>,
    Path((building_id, room_id)): Path<(String, String)>,
    claims: GatewayClaims,
) -> Result<StatusCode, AppError> {
    let mut building = load_building(&state, &building_id).await?;
    assert_can_edit(&claims, &building)?;

    if !building.rooms.iter().any(|r| r.id == room_id) {
        return Err(AppError::NotFound(format!(
            "Room with id \"{room_id}\" in the building \"{building_id}\" not found"
        )));
    }
    if building.rooms.len() == 1 {
        return Err(AppError::Validation(
            "Cannot delete the last room in a building".to_string(),
        ));
    }

    building.rooms.retain(|r| r.id != room_id);
    db::replace(&state.buildings, &building).await?;
    outbound::sync_building_clone(&state.outbound, &building, None, Some(&claims.raw)).await?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct ReplaceRoomsRequest {
    #[serde(default)]
    pub rooms: Vec<RoomWireInput>,
}

// Atomic bulk replace -- validates every room before writing any of them so
// a bad room never produces a partial write.
pub async fn replace_rooms(
    State(state): State<AppState>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
    Json(body): Json<ReplaceRoomsRequest>,
) -> Result<Json<Building>, AppError> {
    let mut building = load_building(&state, &building_id).await?;
    assert_can_edit(&claims, &building)?;

    if body.rooms.is_empty() {
        return Err(AppError::Validation(
            "'rooms' must be a non-empty array".to_string(),
        ));
    }

    let mut seen_ids = HashSet::new();
    let mut normalized = Vec::with_capacity(body.rooms.len());
    for raw in body.rooms {
        let id = raw.id.trim();
        if id.is_empty() {
            return Err(AppError::Validation(
                "Every room must have a non-empty 'id'".to_string(),
            ));
        }
        if !seen_ids.insert(id.to_string()) {
            return Err(AppError::Validation(format!("Duplicate room id \"{id}\"")));
        }
        normalized.push(raw.into_room()?);
    }

    let previous_ids: HashSet<String> = building.rooms.iter().map(|r| r.id.clone()).collect();
    let added_rooms: Vec<Room> = normalized
        .iter()
        .filter(|r| !previous_ids.contains(&r.id))
        .cloned()
        .collect();

    building.rooms = normalized;
    db::replace(&state.buildings, &building).await?;
    outbound::sync_building_clone(&state.outbound, &building, None, Some(&claims.raw)).await?;

    // Best-effort: a dead sensor-threshold row for a removed room is
    // harmless, so only newly-added rooms need reconciliation, and a
    // failure here must never undo the geometry save.
    for room in &added_rooms {
        outbound::init_room_thresholds(
            &state.outbound,
            &building_id,
            &room.id,
            room.capacity,
            Some(&claims.raw),
        )
        .await;
    }

    Ok(Json(building))
}
