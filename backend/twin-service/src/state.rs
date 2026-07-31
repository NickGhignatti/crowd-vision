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
