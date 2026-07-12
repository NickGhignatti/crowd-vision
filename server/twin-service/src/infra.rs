//! Outbound adapters and cross-cutting infrastructure: MongoDB persistence,
//! Cedar authorization, gateway claims extraction, Prometheus metrics, the
//! per-IP rate limiter, and outbound sync calls to sensor-service /
//! contracts-service. The API layer depends on these, never the reverse.

pub mod authz;
pub mod claims;
pub mod db;
pub mod metrics;
pub mod outbound;
pub mod ratelimit;
