// Copied verbatim, tests included, into chat, digital-twin and notification: no shared
// Rust lib holds middleware, so a fix that lands in one copy must land in all three.
use axum::extract::{ConnectInfo, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use dashmap::DashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(60);
const LIMIT: u32 = 300;

#[derive(Clone)]
pub struct RateLimiter {
    counters: Arc<DashMap<IpAddr, (Instant, u32)>>,
    last_sweep: Arc<Mutex<Instant>>,
    pub enabled: bool,
}

impl RateLimiter {
    pub fn new(enabled: bool) -> Self {
        Self {
            counters: Arc::new(DashMap::new()),
            last_sweep: Arc::new(Mutex::new(Instant::now())),
            enabled,
        }
    }

    /// Drops every client idle for a whole window, at most once per window.
    fn evict_idle(&self, now: Instant) {
        let Ok(mut last) = self.last_sweep.try_lock() else {
            return;
        };
        if now.duration_since(*last) < WINDOW {
            return;
        }
        *last = now;
        drop(last);
        self.counters
            .retain(|_, (started, _)| now.duration_since(*started) <= WINDOW);
    }
}

/// The rightmost forwarded address: the one the edge appended, not one the client wrote.
fn client_ip(headers: &HeaderMap, peer: Option<SocketAddr>) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit(',').next())
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
    limiter.evict_idle(now);

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
    fn the_address_the_edge_appended_wins_over_a_client_supplied_one() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-forwarded-for",
            "203.0.113.5, 198.51.100.7".parse().unwrap(),
        );
        let ip = client_ip(&headers, Some("127.0.0.1:1234".parse().unwrap()));
        assert_eq!(ip, "198.51.100.7".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn without_a_forwarded_for_header_the_peer_address_is_used() {
        let ip = client_ip(&HeaderMap::new(), Some("127.0.0.1:1234".parse().unwrap()));
        assert_eq!(ip, "127.0.0.1".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn without_any_source_the_client_is_the_unspecified_address() {
        let ip = client_ip(&HeaderMap::new(), None);
        assert_eq!(ip, IpAddr::from([0, 0, 0, 0]));
    }

    #[test]
    fn a_malformed_forwarded_for_header_falls_back_to_the_peer_address() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "not-an-ip".parse().unwrap());
        let ip = client_ip(&headers, Some("127.0.0.1:1234".parse().unwrap()));
        assert_eq!(ip, "127.0.0.1".parse::<IpAddr>().unwrap());
    }

    use axum::Router;
    use axum::body::Body;
    use axum::http::Request as HttpRequest;
    use axum::routing::get;
    use tower::ServiceExt;

    fn app(limiter: RateLimiter) -> Router {
        Router::new()
            .route("/", get(async || StatusCode::OK))
            .layer(axum::middleware::from_fn_with_state(limiter, rate_limit))
    }

    async fn send(app: &Router, ip: &str) -> StatusCode {
        app.clone()
            .oneshot(
                HttpRequest::builder()
                    .uri("/")
                    .header("x-forwarded-for", ip)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
            .status()
    }

    async fn exhaust(app: &Router, ip: &str) {
        for _ in 0..LIMIT {
            assert_eq!(send(app, ip).await, StatusCode::OK);
        }
    }

    #[tokio::test]
    async fn every_request_up_to_the_limit_is_served() {
        let app = app(RateLimiter::new(true));
        exhaust(&app, "203.0.113.1").await;
    }

    #[tokio::test]
    async fn the_request_past_the_limit_is_rejected() {
        let app = app(RateLimiter::new(true));
        exhaust(&app, "203.0.113.2").await;

        assert_eq!(
            send(&app, "203.0.113.2").await,
            StatusCode::TOO_MANY_REQUESTS
        );
    }

    #[tokio::test]
    async fn a_disabled_limiter_never_rejects() {
        let app = app(RateLimiter::new(false));
        for _ in 0..LIMIT + 10 {
            assert_eq!(send(&app, "203.0.113.3").await, StatusCode::OK);
        }
    }

    #[tokio::test]
    async fn one_noisy_client_does_not_throttle_another() {
        let app = app(RateLimiter::new(true));
        exhaust(&app, "203.0.113.4").await;

        assert_eq!(
            send(&app, "203.0.113.4").await,
            StatusCode::TOO_MANY_REQUESTS
        );
        assert_eq!(send(&app, "203.0.113.5").await, StatusCode::OK);
    }

    #[tokio::test]
    async fn a_new_forged_address_per_request_does_not_reset_the_count() {
        let app = app(RateLimiter::new(true));
        for i in 0..LIMIT {
            let forwarded = format!("10.0.{}.{}, 203.0.113.9", i / 256, i % 256);
            assert_eq!(send(&app, &forwarded).await, StatusCode::OK);
        }
        assert_eq!(
            send(&app, "10.9.9.9, 203.0.113.9").await,
            StatusCode::TOO_MANY_REQUESTS
        );
    }

    #[tokio::test]
    async fn a_client_idle_for_a_window_is_forgotten() {
        let limiter = RateLimiter::new(true);
        let app = app(limiter.clone());
        let idle: IpAddr = "203.0.113.7".parse().unwrap();
        send(&app, "203.0.113.7").await;

        let aged = Instant::now()
            .checked_sub(WINDOW + Duration::from_secs(1))
            .expect("the monotonic clock is older than one window");
        limiter.counters.get_mut(&idle).unwrap().0 = aged;
        *limiter.last_sweep.lock().unwrap() = aged;
        send(&app, "203.0.113.8").await;

        assert!(!limiter.counters.contains_key(&idle));
    }

    #[tokio::test]
    async fn the_count_starts_over_once_the_window_has_elapsed() {
        let limiter = RateLimiter::new(true);
        let app = app(limiter.clone());
        let ip: IpAddr = "203.0.113.6".parse().unwrap();

        exhaust(&app, "203.0.113.6").await;
        assert_eq!(
            send(&app, "203.0.113.6").await,
            StatusCode::TOO_MANY_REQUESTS
        );

        let aged = Instant::now()
            .checked_sub(WINDOW + Duration::from_secs(1))
            .expect("the monotonic clock is older than one window");
        limiter.counters.get_mut(&ip).unwrap().0 = aged;

        assert_eq!(send(&app, "203.0.113.6").await, StatusCode::OK);
    }
}
