use std::sync::LazyLock;

use prometheus::{Encoder, Gauge, IntCounter, IntCounterVec, Opts, Registry, TextEncoder};

pub const CHANNEL_TELEMETRY: &str = "telemetry";
pub const CHANNEL_NOTIFICATIONS: &str = "notifications";
pub const SCOPE_DOMAIN: &str = "domain";
pub const REASON_FORBIDDEN: &str = "forbidden";
pub const REASON_LOOKUP_FAILED: &str = "lookup_failed";
pub const SCOPE_BROADCAST: &str = "broadcast";

static REGISTRY: LazyLock<Registry> = LazyLock::new(Registry::new);

pub static TELEMETRY_RELAYED_TOTAL: LazyLock<IntCounter> = LazyLock::new(|| {
    register(IntCounter::new(
        "telemetry_relayed_total",
        "Telemetry messages relayed to building rooms",
    ))
});

pub static NOTIFICATIONS_RELAYED_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register(IntCounterVec::new(
        Opts::new(
            "notifications_relayed_total",
            "Notification messages relayed, by delivery scope",
        ),
        &["scope"],
    ))
});

pub static RELAY_PAYLOAD_BYTES_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register(IntCounterVec::new(
        Opts::new(
            "relay_payload_bytes_total",
            "Bytes of broker payload relayed to rooms, before fan-out amplification",
        ),
        &["channel"],
    ))
});

pub static RELAY_MESSAGES_SKIPPED_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register(IntCounterVec::new(
        Opts::new(
            "relay_messages_skipped_total",
            "Broker messages dropped because the payload was not valid JSON",
        ),
        &["channel"],
    ))
});

pub static CONNECTIONS_REJECTED_TOTAL: LazyLock<IntCounter> = LazyLock::new(|| {
    register(IntCounter::new(
        "socket_connections_rejected_total",
        "Handshakes refused because the claims header was missing or malformed",
    ))
});

pub static SUBSCRIPTIONS_REJECTED_TOTAL: LazyLock<IntCounterVec> = LazyLock::new(|| {
    register(IntCounterVec::new(
        Opts::new(
            "socket_subscriptions_rejected_total",
            "Building subscriptions refused, by reason",
        ),
        &["reason"],
    ))
});

pub static SOCKETS_EXPIRED_TOTAL: LazyLock<IntCounter> = LazyLock::new(|| {
    register(IntCounter::new(
        "socket_sessions_expired_total",
        "Sockets disconnected because their authorised lifetime elapsed",
    ))
});

pub static CONNECTED_CLIENTS: LazyLock<Gauge> = LazyLock::new(|| {
    register(Gauge::new(
        "socket_connected_clients",
        "Currently connected Socket.IO clients",
    ))
});

fn register<C>(collector: prometheus::Result<C>) -> C
where
    C: prometheus::core::Collector + Clone + 'static,
{
    let collector = collector.expect("metric definition is valid");
    REGISTRY
        .register(Box::new(collector.clone()))
        .expect("metric is registered once");
    collector
}

pub fn init() {
    LazyLock::force(&TELEMETRY_RELAYED_TOTAL);
    LazyLock::force(&CONNECTIONS_REJECTED_TOTAL);
    LazyLock::force(&CONNECTED_CLIENTS);
    LazyLock::force(&SOCKETS_EXPIRED_TOTAL);

    for channel in [CHANNEL_TELEMETRY, CHANNEL_NOTIFICATIONS] {
        RELAY_PAYLOAD_BYTES_TOTAL.with_label_values(&[channel]);
        RELAY_MESSAGES_SKIPPED_TOTAL.with_label_values(&[channel]);
    }
    for reason in [REASON_FORBIDDEN, REASON_LOOKUP_FAILED] {
        SUBSCRIPTIONS_REJECTED_TOTAL.with_label_values(&[reason]);
    }
    for scope in [SCOPE_DOMAIN, SCOPE_BROADCAST] {
        NOTIFICATIONS_RELAYED_TOTAL.with_label_values(&[scope]);
    }
}

pub fn gather() -> String {
    let mut buffer = Vec::new();
    let encoder = TextEncoder::new();
    encoder
        .encode(&REGISTRY.gather(), &mut buffer)
        .expect("prometheus text encoding never fails");
    String::from_utf8(buffer).expect("prometheus text output is utf8")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_series_is_exposed_at_zero_before_anything_is_recorded() {
        init();

        let text = gather();

        for series in [
            "telemetry_relayed_total 0",
            "socket_connected_clients 0",
            "socket_connections_rejected_total 0",
            "socket_sessions_expired_total 0",
            r#"notifications_relayed_total{scope="domain"} 0"#,
            r#"notifications_relayed_total{scope="broadcast"} 0"#,
            r#"relay_payload_bytes_total{channel="telemetry"} 0"#,
            r#"relay_payload_bytes_total{channel="notifications"} 0"#,
            r#"relay_messages_skipped_total{channel="telemetry"} 0"#,
            r#"relay_messages_skipped_total{channel="notifications"} 0"#,
            r#"socket_subscriptions_rejected_total{reason="forbidden"} 0"#,
            r#"socket_subscriptions_rejected_total{reason="lookup_failed"} 0"#,
        ] {
            assert!(text.contains(series), "missing series: {series}");
        }
    }
}
