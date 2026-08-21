#[derive(Debug)]
pub enum DomainError {
    Validation(String),
    Unauthorized(String),
    NotFound(String),
    Conflict(String),
    BadGateway(String),
    Internal(anyhow::Error),
}

impl DomainError {
    pub fn not_found() -> Self {
        DomainError::NotFound("Conversation not found".to_string())
    }
}

impl From<anyhow::Error> for DomainError {
    fn from(e: anyhow::Error) -> Self {
        DomainError::Internal(e)
    }
}
