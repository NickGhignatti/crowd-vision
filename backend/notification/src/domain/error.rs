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

impl DomainError {
    pub fn validation(message: &str) -> Self {
        DomainError::Validation(message.to_string())
    }
}
