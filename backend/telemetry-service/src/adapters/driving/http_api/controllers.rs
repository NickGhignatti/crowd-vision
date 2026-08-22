use crate::adapters::metrics;
use crate::contracts::error::DomainError;
use crate::contracts::identity::GatewayClaims;
use crate::contracts::plugin::ENVELOPE_FIELDS;
use crate::contracts::reading::Reading;
use crate::contracts::sensor::Command;
use crate::contracts::threshold::{Bounds, TemperatureLimits};
use crate::kernel::authz;
use crate::kernel::readings::DashboardQuery;
use crate::state::AppState;
use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::sync::Arc;
use std::time::Instant;
use telemetry_contracts::{
    ActionContract, ActionParameterContract, MetricContract, MetricFieldContract,
    ServiceMetricsContract,
};

#[derive(Deserialize)]
pub struct BuildingQuery {
    building: String,
    #[serde(rename = "roomId")]
    room_id: Option<String>,
}

#[derive(Deserialize)]
pub struct DashboardParams {
    building: String,
    #[serde(rename = "roomId")]
    room_id: Option<String>,
    #[serde(rename = "timeRange")]
    time_range: Option<String>,
    start: Option<i64>,
    end: Option<i64>,
    #[serde(rename = "aggMode")]
    agg_mode: Option<String>,
}

async fn read(state: &AppState, claims: &GatewayClaims, building: &str) -> Result<(), DomainError> {
    let domains = state
        .directory
        .domains_of(building, &claims.raw)
        .await
        .map_err(|error| {
            log::error!("domain lookup failed for {building}: {error}");
            DomainError::Forbidden("Not authorized for this building".to_owned())
        })?;
    match domains.iter().any(|d| authz::is_member_of(claims, d)) {
        true => Ok(()),
        false => {
            metrics::record_authz_denial("read");
            Err(DomainError::Forbidden(
                "Not authorized for this building".to_owned(),
            ))
        }
    }
}

async fn edit(state: &AppState, claims: &GatewayClaims, building: &str) -> Result<(), DomainError> {
    let domains = state
        .directory
        .domains_of(building, &claims.raw)
        .await
        .map_err(|error| {
            log::error!("domain lookup failed for {building}: {error}");
            DomainError::Forbidden("Not authorized for this building".to_owned())
        })?;
    match authz::can_edit_domains(claims, &domains) {
        true => Ok(()),
        false => {
            metrics::record_authz_denial("edit");
            Err(DomainError::Forbidden(
                "Not authorized for this building".to_owned(),
            ))
        }
    }
}

fn reading_json(reading: &Reading) -> Value {
    let mut body = Map::new();
    body.insert("building".to_owned(), json!(reading.building_id));
    body.insert("roomId".to_owned(), json!(reading.room_id));
    body.insert("timestamp".to_owned(), json!(reading.ts_ms));
    body.insert("value".to_owned(), json!(reading.value));
    for (key, value) in &reading.payload {
        if !ENVELOPE_FIELDS.contains(&key.as_str()) {
            body.insert(key.clone(), value.clone());
        }
    }
    Value::Object(body)
}

fn limits_json(limits: &TemperatureLimits) -> Value {
    json!({
        "buildingId": limits.building_id,
        "maxTemperature": limits.max_temperature,
        "rooms": limits.rooms.iter().map(|room| json!({
            "id": room.room_id,
            "maxTemperature": room.max_temperature,
        })).collect::<Vec<_>>(),
    })
}

fn object(body: Value) -> Result<Map<String, Value>, DomainError> {
    body.as_object()
        .cloned()
        .ok_or_else(|| DomainError::Validation("body: must be an object.".to_owned()))
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}

pub async fn metrics(State(state): State<Arc<AppState>>) -> impl axum::response::IntoResponse {
    metrics::set_pool_gauges(state.pool.size(), state.pool.num_idle());
    metrics::metrics_handler().await
}

pub async fn contracts(State(state): State<Arc<AppState>>) -> Json<ServiceMetricsContract> {
    let metrics = state
        .registry
        .all()
        .iter()
        .map(|plugin| {
            let descriptor = plugin.descriptor();
            MetricContract {
                metric_key: descriptor.key.to_owned(),
                label: descriptor.label.to_owned(),
                interface_name: descriptor.interface_name.to_owned(),
                unit: descriptor.unit.map(str::to_owned),
                fields: descriptor
                    .fields
                    .iter()
                    .map(|field| MetricFieldContract {
                        name: field.name.to_owned(),
                        field_type: format!("{:?}", field.kind),
                        required: field.required,
                        description: None,
                    })
                    .collect(),
                actions: plugin
                    .actions()
                    .iter()
                    .map(|action| ActionContract {
                        name: action.name.to_owned(),
                        label: action.label.to_owned(),
                        parameters: action
                            .parameters
                            .iter()
                            .map(|parameter| ActionParameterContract {
                                name: parameter.name.to_owned(),
                                parameter_type: format!("{:?}", parameter.kind),
                                required: parameter.required,
                            })
                            .collect(),
                    })
                    .collect(),
                source_service: None,
            }
        })
        .collect();
    Json(ServiceMetricsContract {
        service: "telemetry-service".to_owned(),
        metrics,
    })
}

pub async fn ingest(State(state): State<Arc<AppState>>, Json(mut body): Json<Value>) -> Response {
    let Some(sensor_type) = body
        .as_object_mut()
        .and_then(|payload| payload.remove("type"))
        .and_then(|value| {
            value
                .as_str()
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(str::to_owned)
        })
    else {
        metrics::record_ingest("unknown", "invalid");
        return DomainError::Validation("type: must be a non-empty string.".to_owned())
            .into_response();
    };

    let accepted = state.ingest.accept(&sensor_type, &body).await;
    metrics::record_ingest(
        &sensor_type,
        match &accepted {
            Ok(()) => "accepted",
            Err(DomainError::NotFound(_)) => "unknown_type",
            Err(_) => "invalid",
        },
    );

    match accepted {
        Ok(()) => (
            StatusCode::ACCEPTED,
            Json(json!({ "accepted": true, "type": sensor_type })),
        )
            .into_response(),
        Err(DomainError::Validation(message)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": "Payload validation failed.", "details": [message] })),
        )
            .into_response(),
        Err(error) => error.into_response(),
    }
}

pub async fn latest(
    State(state): State<Arc<AppState>>,
    Path(sensor_type): Path<String>,
    Query(query): Query<BuildingQuery>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &query.building).await?;
    let room_id = query
        .room_id
        .ok_or_else(|| DomainError::Validation("roomId: must be a non-empty string.".to_owned()))?;
    let started = Instant::now();
    let reading = state
        .readings
        .latest(&sensor_type, &query.building, &room_id)
        .await;
    metrics::record_query("latest", started.elapsed());
    let reading = reading?;
    Ok(Json(json!({ "data": reading_json(&reading) })))
}

pub async fn entire_building(
    State(state): State<Arc<AppState>>,
    Path(sensor_type): Path<String>,
    Query(query): Query<BuildingQuery>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &query.building).await?;
    let started = Instant::now();
    let rows = state
        .readings
        .entire_building(&sensor_type, &query.building)
        .await;
    metrics::record_query("entire_building", started.elapsed());
    let rows = rows?;
    let data: Vec<Value> = rows.iter().map(reading_json).collect();
    Ok(Json(json!({ "data": data })))
}

pub async fn dashboard(
    State(state): State<Arc<AppState>>,
    Path(sensor_type): Path<String>,
    Query(params): Query<DashboardParams>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &params.building).await?;
    let started = Instant::now();
    let buckets = state
        .readings
        .dashboard(DashboardQuery {
            metric: &sensor_type,
            building_id: &params.building,
            room_id: params.room_id.as_deref(),
            range: params.time_range.as_deref(),
            start_ms: params.start,
            end_ms: params.end,
            agg: params.agg_mode.as_deref(),
        })
        .await;
    metrics::record_query("dashboard", started.elapsed());
    let buckets = buckets?;
    let data: Vec<Value> = buckets
        .iter()
        .map(|bucket| json!({ "timestamp": bucket.ts_ms, "value": bucket.value }))
        .collect();
    Ok(Json(json!({ "data": data })))
}

pub async fn building_sensors(
    State(state): State<Arc<AppState>>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &building_id).await?;
    let sensors = state.sensors.by_building(&building_id).await?;
    let data = state.with_actions(&sensors).await;
    Ok(Json(json!({ "data": data })))
}

pub async fn room_sensors(
    State(state): State<Arc<AppState>>,
    Path((building_id, room_id)): Path<(String, String)>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &building_id).await?;
    let sensors = state.sensors.by_room(&building_id, &room_id).await?;
    let data = state.with_actions(&sensors).await;
    Ok(Json(json!({ "data": data })))
}

pub async fn register_sensor(
    State(state): State<Arc<AppState>>,
    claims: GatewayClaims,
    Json(body): Json<Value>,
) -> Result<(StatusCode, Json<Value>), DomainError> {
    let building = body["sensorData"]["buildingId"]
        .as_str()
        .unwrap_or_default();
    edit(&state, &claims, building).await?;
    let sensor = state.sensors.register(&body).await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "created": true, "type": sensor.sensor_type })),
    ))
}

pub async fn execute_action(
    State(state): State<Arc<AppState>>,
    claims: GatewayClaims,
    Json(body): Json<Value>,
) -> Result<Json<Value>, DomainError> {
    let data = body
        .get("actionData")
        .filter(|data| data.is_object())
        .ok_or_else(|| DomainError::Validation("actionData: must be an object.".to_owned()))?;

    let field = |name: &str| -> Result<String, DomainError> {
        data[name]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| DomainError::Validation(format!("{name}: must be a non-empty string.")))
    };

    let command = Command {
        metric: field("metric")?,
        building_id: field("buildingId")?,
        room_id: field("roomId")?,
        sensor_id: field("sensorId")?,
        action: field("action")?,
        arguments: data["arguments"].as_object().cloned().unwrap_or_default(),
    };

    edit(&state, &claims, &command.building_id).await?;
    state.actions.execute(&command).await?;
    Ok(Json(json!({ "accepted": true, "action": command.action })))
}

pub async fn register_building(
    State(state): State<Arc<AppState>>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
    Json(body): Json<Value>,
) -> Result<Json<Value>, DomainError> {
    edit(&state, &claims, &building_id).await?;
    state.registration.register(&building_id, &body).await?;
    Ok(Json(json!({ "message": "Building registered" })))
}

pub async fn building_limits(
    State(state): State<Arc<AppState>>,
    Path(building_id): Path<String>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &building_id).await?;
    let limits = state.thresholds.temperature_limits(&building_id).await?;
    Ok(Json(
        limits
            .map(|limits| limits_json(&limits))
            .unwrap_or(Value::Null),
    ))
}

pub async fn building_threshold(
    State(state): State<Arc<AppState>>,
    Path((sensor_type, building_id)): Path<(String, String)>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    read(&state, &claims, &building_id).await?;
    let bounds = state
        .thresholds
        .get_building_threshold_by_metric(&sensor_type, &building_id)
        .await?;
    Ok(Json(json!({ "data": bounds })))
}

pub async fn patch_building_threshold(
    State(state): State<Arc<AppState>>,
    Path((sensor_type, building_id)): Path<(String, String)>,
    claims: GatewayClaims,
    Json(body): Json<Value>,
) -> Result<Json<Value>, DomainError> {
    edit(&state, &claims, &building_id).await?;
    let patch: Bounds = object(body)?;
    let stored = state
        .thresholds
        .update_building(&sensor_type, &building_id, &patch)
        .await?;
    Ok(Json(json!({ "data": stored })))
}

pub async fn patch_room_threshold(
    State(state): State<Arc<AppState>>,
    Path((sensor_type, building_id, room_id)): Path<(String, String, String)>,
    claims: GatewayClaims,
    Json(body): Json<Value>,
) -> Result<Json<Value>, DomainError> {
    edit(&state, &claims, &building_id).await?;
    let patch: Bounds = object(body)?;
    let stored = state
        .thresholds
        .update_room(&sensor_type, &building_id, &room_id, &patch)
        .await?;
    Ok(Json(json!({ "data": stored })))
}
