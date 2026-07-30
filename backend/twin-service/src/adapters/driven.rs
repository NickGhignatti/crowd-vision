//! Adapters the core calls out to through a port: durable storage
//! (`persistence`) and the outbound sync to sensor/contracts-service
//! (`outbound`). Each implements exactly one trait from `service::ports`.

pub mod outbound;
pub mod persistence;
