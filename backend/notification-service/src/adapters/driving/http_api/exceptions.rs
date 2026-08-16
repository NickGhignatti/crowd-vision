use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::domain::DomainError;

impl IntoResponse for DomainError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = match self {
            DomainError::Validation(m) => (StatusCode::BAD_REQUEST, "Validation Error", m),
            DomainError::NotFound(m) => (StatusCode::NOT_FOUND, "Not Found Error", m),
            DomainError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, "Unauthorized Error", m),
            DomainError::Forbidden(m) => (StatusCode::FORBIDDEN, "Forbidden Error", m),
            DomainError::Internal(e) => {
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
