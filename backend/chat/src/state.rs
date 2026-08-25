use std::sync::Arc;

use crate::adapters::ratelimit::RateLimiter;
use crate::service::conversations::Conversations;

#[derive(Clone)]
pub struct AppState {
    pub conversations: Arc<Conversations>,
    pub rate_limiter: RateLimiter,
}
