use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::domain::DomainError;

const INTERNAL_MESSAGE: &str = "An unexpected error occurred. Please try again later.";

impl DomainError {
    /// One place decides how a failure is named, so an error that reaches the client
    /// mid-stream reads exactly like the same error delivered as a status code.
    pub fn describe(&self) -> (StatusCode, &'static str, String) {
        match self {
            DomainError::Validation(m) => (StatusCode::BAD_REQUEST, "Validation Error", m.clone()),
            DomainError::Unauthorized(m) => {
                (StatusCode::UNAUTHORIZED, "Unauthorized Error", m.clone())
            }
            DomainError::NotFound(m) => (StatusCode::NOT_FOUND, "Not Found Error", m.clone()),
            DomainError::Conflict(m) => (StatusCode::CONFLICT, "Conflict Error", m.clone()),
            DomainError::BadGateway(m) => (StatusCode::BAD_GATEWAY, "Bad Gateway Error", m.clone()),
            DomainError::Internal(e) => {
                log::error!("{e:?}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal Server Error",
                    INTERNAL_MESSAGE.to_string(),
                )
            }
        }
    }
}

impl IntoResponse for DomainError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = self.describe();
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
    use axum::body::to_bytes;

    async fn rendered(error: DomainError) -> (StatusCode, serde_json::Value) {
        let response = error.into_response();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap())
    }

    #[tokio::test]
    async fn a_validation_error_keeps_its_message_and_node_type_name() {
        let (status, body) = rendered(DomainError::Validation(
            "content must be a non-empty string".into(),
        ))
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["type"], "Validation Error");
        assert_eq!(body["message"], "content must be a non-empty string");
    }

    #[tokio::test]
    async fn a_missing_conversation_is_a_404_not_a_403() {
        let (status, body) = rendered(DomainError::not_found()).await;

        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["type"], "Not Found Error");
        assert_eq!(body["message"], "Conversation not found");
    }

    #[tokio::test]
    async fn the_message_cap_is_a_conflict() {
        let (status, body) = rendered(DomainError::Conflict(
            "Conversation message limit reached".into(),
        ))
        .await;

        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["type"], "Conflict Error");
    }

    #[tokio::test]
    async fn an_unreachable_agent_is_a_bad_gateway() {
        let (status, body) = rendered(DomainError::BadGateway(
            "Could not reach agent-service".into(),
        ))
        .await;

        assert_eq!(status, StatusCode::BAD_GATEWAY);
        assert_eq!(body["type"], "Bad Gateway Error");
        assert_eq!(body["message"], "Could not reach agent-service");
    }

    #[tokio::test]
    async fn a_missing_token_is_unauthorized() {
        let (status, body) = rendered(DomainError::Unauthorized(
            "Missing authentication token".into(),
        ))
        .await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["type"], "Unauthorized Error");
    }

    #[tokio::test]
    async fn an_internal_failure_never_leaks_its_cause() {
        let (status, body) = rendered(DomainError::Internal(anyhow::anyhow!(
            "mongo credentials rejected"
        )))
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["type"], "Internal Server Error");
        assert_eq!(body["message"], INTERNAL_MESSAGE);
    }
}
