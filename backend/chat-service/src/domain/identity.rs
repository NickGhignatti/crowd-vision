pub use claims_contracts::{CLAIMS_HEADER, ClaimsPayload};

#[derive(Debug, Clone)]
pub struct GatewayClaims {
    pub user_id: String,
    pub raw: String,
}
