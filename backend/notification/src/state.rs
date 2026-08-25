use std::sync::Arc;

use crate::adapters::ratelimit::RateLimiter;
use crate::service::alerts::Alerts;
use crate::service::preferences::Preferences;

#[derive(Clone)]
pub struct AppState {
    pub alerts: Arc<Alerts>, // hold capabilities for alerting
    pub preferences: Arc<Preferences>,
    pub vapid_public_key: String,
    pub rate_limiter: RateLimiter,
}
