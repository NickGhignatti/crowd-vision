use mongodb::Collection;

use crate::infra::outbound::OutboundConfig;
use crate::infra::ratelimit::RateLimiter;
use crate::models::Building;

#[derive(Clone)]
pub struct AppState {
    pub buildings: Collection<Building>,
    pub outbound: OutboundConfig,
    pub rate_limiter: RateLimiter,
}
