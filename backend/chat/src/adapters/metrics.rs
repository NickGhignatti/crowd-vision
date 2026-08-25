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

// prometheus.rules.yml alerts on these exact names. Renaming them silences the
// alerts rather than breaking them, so the `chat_` prefix outlives the rewrite.
pub static HTTP_REQUESTS_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "chat_http_requests_total",
        "Total number of chat HTTP requests",
        LABELS,
        REGISTRY
    )
    .expect("metric can be created")
});

pub static HTTP_REQUESTS_ERROR: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register_int_counter_vec_with_registry!(
        "chat_http_error_requests_total",
        "Total number of chat HTTP requests that failed with a server (5xx) error",
        LABELS,
        REGISTRY
    )
    .expect("metric can be created")
});

pub static HTTP_REQUEST_DURATION: LazyLock<HistogramVec> = LazyLock::new(|| {
    register_histogram_vec_with_registry!(
        "chat_http_request_duration_seconds",
        "Duration of chat HTTP requests in seconds",
        LABELS,
        vec![0.05, 0.1, 0.3, 0.5, 1.0, 2.0, 5.0],
        REGISTRY
    )
    .expect("metric can be created")
});

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
    async fn the_endpoint_renders_the_counters_under_the_names_the_alerts_use() {
        HTTP_REQUESTS_TOTAL
            .with_label_values(&["GET", "/health", "200"])
            .inc();
        HTTP_REQUEST_DURATION
            .with_label_values(&["GET", "/health", "200"])
            .observe(0.01);

        let response = metrics_handler().await.into_response();
        let content_type = response
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let text = String::from_utf8(body.to_vec()).unwrap();

        assert!(content_type.starts_with("text/plain"));
        assert!(text.contains("chat_http_requests_total"));
        assert!(text.contains("chat_http_request_duration_seconds"));
    }

    #[tokio::test]
    async fn a_not_found_conversation_does_not_count_as_a_service_error() {
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
    async fn the_infrastructure_endpoints_are_not_measured() {
        assert!(is_infra_path("/health"));
        assert!(is_infra_path("/metrics/"));
        assert!(!is_infra_path("/conversations"));
    }

    #[tokio::test]
    async fn health_is_200() {
        assert_eq!(health().await, StatusCode::OK);
    }
}
