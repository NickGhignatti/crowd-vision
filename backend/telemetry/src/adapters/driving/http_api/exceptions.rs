use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::types::error::DomainError;

impl IntoResponse for DomainError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = match self {
            DomainError::Validation(m) => (StatusCode::BAD_REQUEST, "Validation Error", m),
            DomainError::Rejected(items) => {
                let body = serde_json::json!({
                    "type": "Rejected Error",
                    "message": format!("{} item(s) rejected.", items.len()),
                    "errors": items,
                });
                return (StatusCode::UNPROCESSABLE_ENTITY, Json(body)).into_response();
            }
            DomainError::NotFound(m) => (StatusCode::NOT_FOUND, "Not Found Error", m),
            DomainError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, "Unauthorized Error", m),
            DomainError::Forbidden(m) => (StatusCode::FORBIDDEN, "Forbidden Error", m),
            DomainError::Conflict(m) => (StatusCode::CONFLICT, "Conflict Error", m),
            DomainError::BadGateway(m) => (StatusCode::BAD_GATEWAY, "Bad Gateway Error", m),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::error::ItemError;
    use serde_json::{Value, json};

    #[tokio::test]
    async fn a_rejected_batch_is_422_listing_every_item() {
        let response = DomainError::Rejected(vec![ItemError {
            reference: "d1".to_owned(),
            field: "name".to_owned(),
            message: "must be a non-empty string.".to_owned(),
        }])
        .into_response();

        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(
            body["errors"],
            json!([{ "ref": "d1", "field": "name", "message": "must be a non-empty string." }])
        );
    }
}
