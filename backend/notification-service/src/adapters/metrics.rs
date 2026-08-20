use axum::extract::{MatchedPath, Request};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use prometheus::{
    Encoder, HistogramVec, IntCounterVec, Registry, TextEncoder,
    register_histogram_vec_with_registry, register_int_counter_vec_with_registry,
};
use std::sync::LazyLock;
use std::time::Instant;

pub static REGISTRY: LazyLock<Registry> = LazyLock::new(Registry::new);

const LABELS: &[&str] = &["method", "route", "status_code"];

pub static HTTP_REQUESTS_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "http_requests_total",
        "Total number of HTTP requests",
        LABELS,
        REGISTRY
    )
    .expect("metric can be created")
});

pub static HTTP_REQUESTS_ERROR: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "http_error_requests_total",
        "Total number of HTTP requests that failed with a server (5xx) error",
        LABELS,
        REGISTRY
    )
    .expect("metric can be created")
});

pub static HTTP_REQUEST_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    register_histogram_vec_with_registry!(
        "http_request_duration_seconds",
        "Duration of HTTP requests in seconds",
        LABELS,
        vec![0.05, 0.1, 0.3, 0.5, 1.0, 2.0, 5.0],
        REGISTRY
    )
    .expect("metric can be created")
});

pub static ALERTS_CONSUMED_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "notification_alerts_consumed_total",
        "Total number of records read from the alerts topic",
        &["outcome"],
        REGISTRY
    )
    .expect("metric can be created")
});

pub fn record_alert_consumed(outcome: &str) {
    ALERTS_CONSUMED_TOTAL.with_label_values(&[outcome]).inc();
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
        .unwrap_or(path);
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
    use axum::body::to_bytes;

    #[tokio::test]
    async fn the_endpoint_renders_the_http_counters_as_prometheus_text() {
        HTTP_REQUESTS_TOTAL
            .with_label_values(&["GET", "/health", "200"])
            .inc();

        let response = metrics_handler().await.into_response();
        let content_type = response
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();

        assert!(content_type.starts_with("text/plain"));
        assert!(
            String::from_utf8(bytes.to_vec())
                .unwrap()
                .contains("http_requests_total")
        );
    }

    #[tokio::test]
    async fn only_server_errors_count_toward_the_error_metric() {
        use axum::Router;
        use axum::body::Body;
        use axum::routing::get;
        use tower::ServiceExt;

        let app = Router::new()
            .route("/metrics-test-404", get(async || StatusCode::NOT_FOUND))
            .route(
                "/metrics-test-500",
                get(async || StatusCode::INTERNAL_SERVER_ERROR),
            )
            .layer(axum::middleware::from_fn(track_metrics));

        for path in ["/metrics-test-404", "/metrics-test-500"] {
            app.clone()
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
        }

        assert_eq!(
            HTTP_REQUESTS_ERROR
                .with_label_values(&["GET", "/metrics-test-404", "404"])
                .get(),
            0
        );
        assert_eq!(
            HTTP_REQUESTS_ERROR
                .with_label_values(&["GET", "/metrics-test-500", "500"])
                .get(),
            1
        );
    }

    #[tokio::test]
    async fn health_is_200() {
        assert_eq!(health().await, StatusCode::OK);
    }
}
