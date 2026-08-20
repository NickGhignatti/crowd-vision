# telemetry-service

Rust / Axum / Postgres+Timescale / Kafka / Redis. Telemetry ingestion (readings, thresholds,
device actions).

## Shape

Hexagon + microkernel on orthogonal axes:

- `src/contracts/` — pure types + `SensorPlugin`/`ActionSpec` traits, depends on nothing
- `src/kernel/` — use cases + `Arc<dyn Port>`, the microkernel; never names a plugin
- `src/plugins/` — one file per metric; never import each other or the kernel
- `src/adapters/driven|driving/`
- wired in `main.rs`

Test-enforced by `tests/architecture.rs`.

Device vocabulary lives **only** in `adapters/driven/dispatch.rs` — see `design/sensor-actions.qd`.
Storage levers in `design/telemetry-storage.qd`.

## Routes

`router()` in `lib.rs` splits `public` (health, metrics, contracts, `/ingest`) from `protected`
(thresholds, sensors, actions, queries). `/ingest` is ungated at the edge too.

`adapters/ratelimit.rs` exists but is **not wired** — `router()` layers only `track_metrics`.
twin-service and notification-service wire theirs. See issue #346.

## Breach alerts

Every threshold breach goes to the `alerts` Kafka topic, keyed `buildingId:roomId`, produced
enqueue-only (`send_result`) so a broker outage never stalls `/telemetry/ingest`. Telemetry
fan-out stays on Redis. Consumer side: `backend/notification-service/CLAUDE.md`.

## Tests

`src/` = unit only (`just test telemetry`).
