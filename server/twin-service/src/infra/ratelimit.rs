use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use dashmap::DashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(60);
const LIMIT: u32 = 300;

// Per-IP fixed-window limiter.
#[derive(Clone)]
pub struct RateLimiter {
    counters: Arc<DashMap<IpAddr, (Instant, u32)>>,
    pub enabled: bool,
}

impl RateLimiter {
    pub fn new(enabled: bool) -> Self {
        Self {
            counters: Arc::new(DashMap::new()),
            enabled,
        }
    }
}

// Behind the Caddy/Istio ingress: read the real client IP from
// X-Forwarded-For, falling back to the raw socket peer.
fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .and_then(|v| v.trim().parse().ok())
        .or_else(|| peer.map(|p| p.ip()))
        .unwrap_or(IpAddr::from([0, 0, 0, 0]))
}

pub async fn rate_limit(
    State(limiter): State<RateLimiter>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if !limiter.enabled {
        return Ok(next.run(request).await);
    }

    let peer = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|c| c.0);
    let ip = client_ip(request.headers(), peer);
    let now = Instant::now();

    let mut entry = limiter.counters.entry(ip).or_insert((now, 0));
    if now.duration_since(entry.0) > WINDOW {
        *entry = (now, 0);
    }
    entry.1 += 1;
    let exceeded = entry.1 > LIMIT;
    drop(entry);

    if exceeded {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    Ok(next.run(request).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_ip_prefers_forwarded_for_header() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.5, 10.0.0.1".parse().unwrap());
        let ip = client_ip(&headers, Some("127.0.0.1:1234".parse().unwrap()));
        assert_eq!(ip, "203.0.113.5".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn client_ip_falls_back_to_peer_addr() {
        let headers = HeaderMap::new();
        let ip = client_ip(&headers, Some("127.0.0.1:1234".parse().unwrap()));
        assert_eq!(ip, "127.0.0.1".parse::<IpAddr>().unwrap());
    }
}
