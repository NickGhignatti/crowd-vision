#[derive(Debug)]
pub enum DomainError {
    Validation(String),
    NotFound(String),
    Unauthorized(String),
    Forbidden(String),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for DomainError {
    fn from(e: anyhow::Error) -> Self {
        DomainError::Internal(e)
    }
}
