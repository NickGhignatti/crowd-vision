//! Outbound adapters and cross-cutting infrastructure: Mongo persistence, peer-service
//! discovery, metrics. API and tunnel depend on these, never the reverse.

pub mod claims;
pub mod db;
pub mod discovery;
pub mod metrics;
