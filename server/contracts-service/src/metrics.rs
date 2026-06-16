use axum::response::IntoResponse;
use prometheus::{Encoder, IntCounter, TextEncoder, register_int_counter};
use std::sync::LazyLock;

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
