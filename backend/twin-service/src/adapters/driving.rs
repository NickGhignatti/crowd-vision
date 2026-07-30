//! Adapters that originate a call into the core: an HTTP request the caller
//! sent, or the passage of time for the provisioning worker. Neither knows
//! more about the use case than the use case already exposes.

pub mod http_api;
pub mod worker;
