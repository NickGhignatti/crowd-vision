//! Outbound adapters and cross-cutting infrastructure (Mongo, Cedar authz,
//! claims, metrics, rate limiting, outbound sync). API depends on these, never the reverse.

pub mod authz;
pub mod claims;
pub mod db;
pub mod metrics;
pub mod outbound;
pub mod ratelimit;
