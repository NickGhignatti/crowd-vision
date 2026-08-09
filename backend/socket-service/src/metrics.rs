use std::sync::LazyLock;

use prometheus::{Encoder, Gauge, IntCounter, Registry, TextEncoder};

static REGISTRY: LazyLock<Registry> = LazyLock::new(Registry::new);

pub static TELEMETRY_RELAYED_TOTAL: LazyLock<IntCounter> = LazyLock::new(|| {
    register(IntCounter::new(
        "telemetry_relayed_total",
        "Telemetry messages relayed to building rooms",
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
    LazyLock::force(&CONNECTED_CLIENTS);
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
    fn both_metrics_are_exposed_before_anything_is_recorded() {
        init();

        let text = gather();

        assert!(text.contains("telemetry_relayed_total 0"));
        assert!(text.contains("socket_connected_clients 0"));
    }
}
