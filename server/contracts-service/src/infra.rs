//! Outbound adapters and cross-cutting infrastructure: MongoDB persistence,
//! peer-service discovery, and Prometheus metrics. These modules integrate the
//! service with external systems; the API and tunnel depend on them, never the
//! reverse.

pub mod claims;
pub mod db;
pub mod discovery;
pub mod metrics;
