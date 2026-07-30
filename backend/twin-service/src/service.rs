//! Ring 2: the use cases. Each one orchestrates the core's rules and the
//! adapters it needs; it may depend on `domain`, never on `api`.

pub mod authz;
pub mod buildings;
#[cfg(test)]
pub mod fakes;
pub mod ports;
pub mod provisioning;
