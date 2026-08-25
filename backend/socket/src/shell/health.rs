use std::time::Duration;

use crate::core::health::{health_url, is_healthy, wants_health_probe};

const PROBE_TIMEOUT: Duration = Duration::from_secs(3);

/// Returns the exit code when this process was started as a healthcheck probe,
/// `None` when it should go on and serve.
pub async fn probe_exit_code(port: u16) -> Option<i32> {
    if !wants_health_probe(std::env::args()) {
        return None;
    }

    let healthy = match reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() {
        Ok(client) => match client.get(health_url(port)).send().await {
            Ok(response) => is_healthy(response.status().as_u16()),
            Err(_) => false,
        },
        Err(_) => false,
    };

    Some(if healthy { 0 } else { 1 })
}
