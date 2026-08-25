pub use claims_schema::{CLAIMS_HEADER, ClaimsPayload, Membership};

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub payload: ClaimsPayload,
    pub raw: String,
}
