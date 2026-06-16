use axum::response::IntoResponse;
use axum::http::StatusCode;
use prometheus::{Encoder, IntCounter, TextEncoder, register_int_counter};
use prometheus::{Histogram, register_histogram};
use std::sync::LazyLock;

pub static FANOUT_LATENCY_MS: LazyLock<Histogram> = LazyLock::new(|| {
    register_histogram!(
        "telemetry_fanout_latency_ms",
        "Latency from sensor ingestion to contracts fan-out (ms)",
        vec![5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0]
    )
    .expect("metric can be created")
});

pub static EVENTS_RECEIVED: LazyLock<IntCounter> = LazyLock::new(|| {
    register_int_counter!(
        "telemetry_events_received_total",
        "Raw telemetry events received from telemetry:raw"
    )
    .expect("metric can be created")
});

pub static EVENTS_PUBLISHED: LazyLock<IntCounter> = LazyLock::new(|| {
    register_int_counter!(
        "telemetry_events_published_total",
        "Telemetry events forwarded to a building channel"
    )
    .expect("metric can be created")
});

/// GET /metrics for Prometheus metrics.
pub async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let mut buffer = Vec::new();
    encoder
        .encode(&prometheus::gather(), &mut buffer)
        .expect("metrics encode");
    // `format_type()` borrows `encoder`, which is dropped at the end of this
    // function — take an owned copy so the response doesn't reference a local.
    let content_type = encoder.format_type().to_owned();
    ([(axum::http::header::CONTENT_TYPE, content_type)], buffer)
}

/// GET /health
pub async fn health() -> impl IntoResponse {
    StatusCode::OK
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;

    /// Renders the handler's response body to a string.
    async fn rendered_body() -> String {
        let response = metrics_handler().await.into_response();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        String::from_utf8(bytes.to_vec()).unwrap()
    }

    #[tokio::test]
    async fn exposes_the_telemetry_counters() {
        // Touch the lazy statics so they register in the default registry; we
        // assert only on presence (not values), so this is order-independent.
        EVENTS_RECEIVED.inc();
        EVENTS_PUBLISHED.inc();

        let text = rendered_body().await;

        assert!(text.contains("telemetry_events_received_total"));
        assert!(text.contains("telemetry_events_published_total"));
    }

    #[tokio::test]
    async fn serves_prometheus_text_content_type() {
        let response = metrics_handler().await.into_response();
        let content_type = response
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .expect("content-type header present")
            .to_str()
            .unwrap();
        assert!(content_type.starts_with("text/plain"));
    }
}
