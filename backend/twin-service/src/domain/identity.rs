pub use claims_contracts::{CLAIMS_HEADER, ClaimsPayload, Membership};

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub payload: ClaimsPayload,
    pub raw: String,
}
