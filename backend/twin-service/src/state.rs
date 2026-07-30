//! What a handler is handed. Use cases only -- no collection, no HTTP client:
//! which adapter backs each of them was decided in `main.rs`.

use std::sync::Arc;

use crate::adapters::ratelimit::RateLimiter;
use crate::service::buildings::Buildings;
use crate::service::provisioning::Provisioning;

#[derive(Clone)]
pub struct AppState {
    pub buildings: Arc<Buildings>,
    pub provisioning: Arc<Provisioning>,
    pub rate_limiter: RateLimiter,
}
