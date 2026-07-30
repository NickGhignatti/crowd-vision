use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Membership {
    pub domain: String,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClaimsPayload {
    pub sub: String,
    #[serde(default)]
    pub memberships: Vec<Membership>,
}

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub payload: ClaimsPayload,
    pub raw: String,
}
