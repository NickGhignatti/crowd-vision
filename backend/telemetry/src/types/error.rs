/// Why one item of a batch was refused; `reference` is the client's `ref`, or the sensor id.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct ItemError {
    #[serde(rename = "ref")]
    pub reference: String,
    pub field: String,
    pub message: String,
}

#[derive(Debug)]
pub enum DomainError {
    Validation(String),
    Rejected(Vec<ItemError>),
    NotFound(String),
    Conflict(String),
    Unauthorized(String),
    Forbidden(String),
    BadGateway(String),
    Internal(anyhow::Error),
}

impl std::fmt::Display for DomainError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DomainError::Validation(message)
            | DomainError::NotFound(message)
            | DomainError::Conflict(message)
            | DomainError::Unauthorized(message)
            | DomainError::Forbidden(message)
            | DomainError::BadGateway(message) => write!(f, "{message}"),
            DomainError::Rejected(items) => write!(f, "{} item(s) rejected.", items.len()),
            DomainError::Internal(error) => write!(f, "{error}"),
        }
    }
}

impl From<anyhow::Error> for DomainError {
    fn from(e: anyhow::Error) -> Self {
        DomainError::Internal(e)
    }
}
