use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Coordinates {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dimensions {
    pub width: f64,
    pub height: f64,
    pub depth: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: String,
    pub name: String,
    pub capacity: f64,
    pub position: Coordinates,
    pub dimensions: Dimensions,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: String,
    pub name: String,
    pub rooms: Vec<Room>,
    pub domains: Vec<String>,
}

// Validated by hand, not serde: `JSON.stringify(NaN)` becomes `null` on the wire, so
// fields stay optional and get checked in the `to_*` conversions to return our 400, not axum's 422.
#[derive(Debug, Clone, Deserialize)]
pub struct PositionInput {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z: Option<f64>,
}

impl PositionInput {
    pub fn to_coordinates(&self) -> Result<Coordinates, AppError> {
        match (self.x, self.y, self.z) {
            (Some(x), Some(y), Some(z)) if x.is_finite() && y.is_finite() && z.is_finite() => {
                Ok(Coordinates { x, y, z })
            }
            _ => Err(AppError::Validation(
                "position.x, position.y and position.z must be finite numbers".to_string(),
            )),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct DimensionsInput {
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub depth: Option<f64>,
}

impl DimensionsInput {
    pub fn to_dimensions(&self) -> Result<Dimensions, AppError> {
        match (self.width, self.height, self.depth) {
            (Some(width), Some(height), Some(depth))
                if is_finite_positive(width)
                    && is_finite_positive(height)
                    && is_finite_positive(depth) =>
            {
                Ok(Dimensions {
                    width,
                    height,
                    depth,
                })
            }
            _ => Err(AppError::Validation(
                "dimensions.width, dimensions.height and dimensions.depth must be positive numbers"
                    .to_string(),
            )),
        }
    }
}

fn is_finite_positive(v: f64) -> bool {
    v.is_finite() && v > 0.0
}

pub fn validate_capacity(capacity: Option<f64>) -> Result<f64, AppError> {
    match capacity {
        Some(c) if c.is_finite() && c >= 0.0 => Ok(c),
        _ => Err(AppError::Validation(
            "capacity must be a non-negative number".to_string(),
        )),
    }
}

// Same fallback chain as twin-service's names.ts normalizeBuildingName: trimmed
// name, else the supplied id, else the literal "Building".
pub fn normalize_building_name(name: Option<&str>, id: Option<&str>) -> String {
    let trimmed = name.map(str::trim).filter(|s| !s.is_empty());
    trimmed.or(id).unwrap_or("Building").to_string()
}

pub fn normalize_room_name(name: Option<&str>, id: &str) -> String {
    name.map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(id)
        .to_string()
}

#[derive(Debug)]
pub enum AppError {
    Validation(String),
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(e: mongodb::error::Error) -> Self {
        AppError::Internal(e.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = match self {
            AppError::Validation(m) => (StatusCode::BAD_REQUEST, "Validation Error", m),
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, "Not Found Error", m),
            AppError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, "Unauthorized Error", m),
            AppError::Forbidden(m) => (StatusCode::FORBIDDEN, "Forbidden Error", m),
            AppError::Internal(e) => {
                log::error!("{e:?}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error",
                    "An unexpected error occurred. Please try again later.".to_string(),
                )
            }
        };
        (
            status,
            Json(serde_json::json!({ "type": error_type, "message": message })),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_building_name_uses_trimmed_name_when_present() {
        assert_eq!(
            normalize_building_name(Some("  Eng  "), Some("id-1")),
            "Eng"
        );
    }

    #[test]
    fn normalize_building_name_falls_back_to_id_when_name_blank() {
        assert_eq!(normalize_building_name(Some("   "), Some("id-1")), "id-1");
        assert_eq!(normalize_building_name(None, Some("id-1")), "id-1");
    }

    #[test]
    fn normalize_building_name_falls_back_to_building_literal() {
        assert_eq!(normalize_building_name(None, None), "Building");
        assert_eq!(normalize_building_name(Some("  "), None), "Building");
    }

    #[test]
    fn normalize_room_name_falls_back_to_id() {
        assert_eq!(normalize_room_name(Some("  "), "Room-1"), "Room-1");
        assert_eq!(normalize_room_name(Some("Lab"), "Room-1"), "Lab");
    }

    #[test]
    fn rejects_non_positive_dimensions() {
        let bad = DimensionsInput {
            width: Some(0.0),
            height: Some(3.0),
            depth: Some(6.0),
        };
        assert!(bad.to_dimensions().is_err());
    }

    #[test]
    fn accepts_positive_dimensions() {
        let good = DimensionsInput {
            width: Some(1.0),
            height: Some(1.0),
            depth: Some(1.0),
        };
        assert!(good.to_dimensions().is_ok());
    }

    #[test]
    fn rejects_null_position_component() {
        let bad = PositionInput {
            x: None,
            y: Some(0.0),
            z: Some(0.0),
        };
        assert!(bad.to_coordinates().is_err());
    }

    #[test]
    fn rejects_negative_capacity() {
        assert!(validate_capacity(Some(-1.0)).is_err());
        assert!(validate_capacity(None).is_err());
    }

    #[test]
    fn accepts_zero_capacity() {
        assert!(validate_capacity(Some(0.0)).is_ok());
    }
}
