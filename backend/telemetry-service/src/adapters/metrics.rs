use axum::extract::{MatchedPath, Request};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use prometheus::{
    Encoder, Histogram, HistogramVec, IntCounterVec, IntGaugeVec, Registry, TextEncoder,
    register_histogram_vec_with_registry, register_histogram_with_registry,
    register_int_counter_vec_with_registry, register_int_gauge_vec_with_registry,
};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

pub static REGISTRY: LazyLock<Registry> = LazyLock::new(Registry::new);

const LABELS: &[&str] = &["method", "route", "status_code"];
const UNMATCHED_ROUTE: &str = "unmatched";

pub static HTTP_REQUESTS_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_http_requests_total",
        "Total number of HTTP requests",
        LABELS,
        REGISTRY
    )
    .expect("metric can be created")
});

pub static HTTP_REQUESTS_ERROR: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_http_error_requests_total",
        "Total number of HTTP requests that failed with a server (5xx) error",
        LABELS,
        REGISTRY
    )
    .expect("metric can be created")
});

pub static HTTP_REQUEST_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    register_histogram_vec_with_registry!(
        "telemetry_http_request_duration_seconds",
        "Duration of HTTP requests in seconds",
        LABELS,
        vec![0.05, 0.1, 0.3, 0.5, 1.0, 2.0, 5.0],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static INGEST_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_ingest_total",
        "Telemetry readings offered to the service, by outcome",
        &["metric", "outcome"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static INGEST_PERSIST_FAILURES: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_ingest_persist_failures_total",
        "Readings accepted but never persisted",
        &["metric"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static INGEST_PERSIST_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    register_histogram_vec_with_registry!(
        "telemetry_ingest_persist_duration_seconds",
        "Time spent persisting a reading",
        &["metric"],
        vec![0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static THRESHOLD_BREACHES: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_threshold_breaches_total",
        "Readings that breached a configured bound",
        &["metric", "direction"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static ALERTS_PUBLISHED: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_alerts_published_total",
        "Breach alerts published to Redis, by channel and outcome",
        &["channel", "outcome"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static TELEMETRY_PUBLISHED: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_published_total",
        "Telemetry events published to Redis, by outcome",
        &["outcome"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static REGISTRATION_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_registration_total",
        "Building registrations resolved, by outcome",
        &["outcome"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static REGISTRATION_DURATION: LazyLock<Histogram> = LazyLock::new(|| {
    register_histogram_with_registry!(
        "telemetry_registration_duration_seconds",
        "Time from registration request to resolution",
        vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static QUERY_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    register_histogram_vec_with_registry!(
        "telemetry_query_duration_seconds",
        "Read-path latency by query shape",
        &["query"],
        vec![0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static AUTHZ_DENIALS: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "telemetry_authz_denials_total",
        "Requests denied by Cedar, by action",
        &["action"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static DB_POOL_CONNECTIONS: LazyLock<IntGaugeVec> = LazyLock::new(|| {
    register_int_gauge_vec_with_registry!(
        "telemetry_db_pool_connections",
        "Postgres pool connections by state",
        &["state"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub fn record_ingest(metric: &str, outcome: &str) {
    INGEST_TOTAL.with_label_values(&[metric, outcome]).inc();
}

pub fn record_persist_failure(metric: &str) {
    INGEST_PERSIST_FAILURES.with_label_values(&[metric]).inc();
}

pub fn record_persist_duration(metric: &str, duration: Duration) {
    INGEST_PERSIST_DURATION
        .with_label_values(&[metric])
        .observe(duration.as_secs_f64());
}

pub fn record_breach(metric: &str, direction: &str) {
    THRESHOLD_BREACHES
        .with_label_values(&[metric, direction])
        .inc();
}

pub fn record_alert_published(channel: &str, outcome: &str) {
    ALERTS_PUBLISHED
        .with_label_values(&[channel, outcome])
        .inc();
}

pub fn record_telemetry_published(outcome: &str) {
    TELEMETRY_PUBLISHED.with_label_values(&[outcome]).inc();
}

pub fn record_registration(outcome: &str, duration: Duration) {
    REGISTRATION_TOTAL.with_label_values(&[outcome]).inc();
    REGISTRATION_DURATION.observe(duration.as_secs_f64());
}

pub fn record_query(query: &str, duration: Duration) {
    QUERY_DURATION
        .with_label_values(&[query])
        .observe(duration.as_secs_f64());
}

pub fn record_authz_denial(action: &str) {
    AUTHZ_DENIALS.with_label_values(&[action]).inc();
}

pub fn set_pool_gauges(size: u32, idle: usize) {
    DB_POOL_CONNECTIONS
        .with_label_values(&["idle"])
        .set(idle as i64);
    DB_POOL_CONNECTIONS
        .with_label_values(&["in_use"])
        .set(size as i64 - idle as i64);
}

fn is_infra_path(path: &str) -> bool {
    matches!(path, "/metrics" | "/metrics/" | "/health" | "/health/")
}

pub async fn track_metrics(request: Request, next: Next) -> Response {
    let path = request.uri().path().to_string();
    if is_infra_path(&path) {
        return next.run(request).await;
    }

    let method = request.method().to_string();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|m| m.as_str().to_string())
        .unwrap_or_else(|| UNMATCHED_ROUTE.to_owned());
    let start = Instant::now();

    let response = next.run(request).await;

    let status = response.status().as_u16().to_string();
    let labels = [method.as_str(), route.as_str(), status.as_str()];
    HTTP_REQUESTS_TOTAL.with_label_values(&labels).inc();
    HTTP_REQUEST_DURATION
        .with_label_values(&labels)
        .observe(start.elapsed().as_secs_f64());
    if response.status().is_server_error() {
        HTTP_REQUESTS_ERROR.with_label_values(&labels).inc();
    }

    response
}

pub async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let mut buffer = Vec::new();
    encoder
        .encode(&REGISTRY.gather(), &mut buffer)
        .expect("metrics encode");
    let content_type = encoder.format_type().to_owned();
    ([(axum::http::header::CONTENT_TYPE, content_type)], buffer)
}

pub async fn health() -> StatusCode {
    StatusCode::OK
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{Body, to_bytes};
    use axum::http::Request as HttpRequest;
    use axum::routing::get;
    use axum::{Router, middleware};
    use tower::ServiceExt;

    async fn rendered_body() -> String {
        let response = metrics_handler().await.into_response();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    fn app() -> Router {
        Router::new()
            .route("/health", get(health))
            .route("/metrics", get(metrics_handler))
            .route("/{sensorType}/latest", get(|| async { "ok" }))
            .layer(middleware::from_fn(track_metrics))
    }

    async fn call(app: &Router, uri: &str) {
        app.clone()
            .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn a_matched_request_is_counted_under_its_route_template() {
        call(&app(), "/temperature/latest").await;
        let text = rendered_body().await;
        assert!(text.contains(r#"route="/{sensorType}/latest""#));
        assert!(!text.contains(r#"route="/temperature/latest""#));
    }

    #[tokio::test]
    async fn infrastructure_paths_are_not_counted() {
        let app = app();
        call(&app, "/health").await;
        call(&app, "/metrics").await;
        let text = rendered_body().await;
        assert!(!text.contains(r#"route="/health""#));
        assert!(!text.contains(r#"route="/metrics""#));
    }

    #[tokio::test]
    async fn an_unmatched_path_does_not_invent_a_route_label() {
        call(&app(), "/nope/nothing/here").await;
        let text = rendered_body().await;
        assert!(!text.contains("nope"));
        assert!(text.contains(r#"route="unmatched""#));
    }

    #[tokio::test]
    async fn ingest_outcomes_are_counted_per_metric() {
        record_ingest("temperature", "accepted");
        record_ingest("temperature", "invalid");
        record_ingest("humidity", "unknown_type");
        let text = rendered_body().await;
        assert!(
            text.contains(r#"telemetry_ingest_total{metric="temperature",outcome="accepted"} 1"#)
        );
        assert!(
            text.contains(r#"telemetry_ingest_total{metric="temperature",outcome="invalid"} 1"#)
        );
    }

    #[tokio::test]
    async fn a_persist_failure_is_visible_even_though_the_client_got_a_202() {
        record_persist_failure("temperature");
        let text = rendered_body().await;
        assert!(
            text.contains(r#"telemetry_ingest_persist_failures_total{metric="temperature"} 1"#)
        );
    }

    #[tokio::test]
    async fn breaches_are_counted_by_metric_and_direction() {
        record_breach("temperature", "high");
        record_breach("peopleCount", "high");
        let text = rendered_body().await;
        assert!(text.contains(
            r#"telemetry_threshold_breaches_total{direction="high",metric="temperature"} 1"#
        ));
        assert!(text.contains(
            r#"telemetry_threshold_breaches_total{direction="high",metric="peopleCount"} 1"#
        ));
    }

    #[tokio::test]
    async fn publish_outcomes_are_counted_for_both_channels() {
        record_telemetry_published("ok");
        record_telemetry_published("error");
        record_alert_published("alerts", "ok");
        let text = rendered_body().await;
        assert!(text.contains(r#"telemetry_published_total{outcome="error"} 1"#));
        assert!(text.contains(
            r#"telemetry_alerts_published_total{channel="alerts",outcome="ok"} 1"#
        ));
    }

    #[tokio::test]
    async fn registration_records_an_outcome_and_a_duration() {
        record_registration("ready", Duration::from_millis(120));
        record_registration("failed", Duration::from_millis(80));
        let text = rendered_body().await;
        assert!(text.contains(r#"telemetry_registration_total{outcome="ready"} 1"#));
        assert!(text.contains("telemetry_registration_duration_seconds_count 2"));
    }

    #[tokio::test]
    async fn query_latency_is_split_by_shape() {
        record_query("latest", Duration::from_millis(3));
        record_query("dashboard", Duration::from_millis(90));
        let text = rendered_body().await;
        assert!(text.contains(r#"telemetry_query_duration_seconds_count{query="latest"} 1"#));
        assert!(text.contains(r#"telemetry_query_duration_seconds_count{query="dashboard"} 1"#));
    }

    #[tokio::test]
    async fn authz_denials_are_counted_by_action() {
        record_authz_denial("read");
        record_authz_denial("edit");
        let text = rendered_body().await;
        assert!(text.contains(r#"telemetry_authz_denials_total{action="read"} 1"#));
    }

    #[tokio::test]
    async fn pool_gauges_split_idle_from_in_use() {
        set_pool_gauges(10, 4);
        let text = rendered_body().await;
        assert!(text.contains(r#"telemetry_db_pool_connections{state="idle"} 4"#));
        assert!(text.contains(r#"telemetry_db_pool_connections{state="in_use"} 6"#));
    }
}
