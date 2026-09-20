use std::sync::Arc;

use crate::adapters::ratelimit::RateLimiter;
use crate::service::buildings::Buildings;
use crate::service::placements::Placements;
use crate::service::provisioning::Provisioning;

#[derive(Clone)]
pub struct AppState {
    pub buildings: Arc<Buildings>,
    pub placements: Arc<Placements>,
    pub provisioning: Arc<Provisioning>,
    pub rate_limiter: RateLimiter,
}
