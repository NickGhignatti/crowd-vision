//! Adapters the core calls out to through a port: durable storage
//! (`persistence`), the outbound sync to sensor/contracts-service
//! (`outbound`), and the building-registration event publisher
//! (`kafka_producer`). Each implements exactly one trait from `service::ports`.

pub mod kafka_producer;
pub mod outbound;
pub mod persistence;
