# telemetry

Rust / Axum / Postgres+Timescale / Kafka / Redis. Ingests sensor readings, owns thresholds,
sensors and device actions, fans out to dashboard and raises alerts. Routes `/telemetry/*`
gated at the edge; `/telemetry/ingest` ungated and HMAC-verified in-service.
Docs: `documentation/architecture/telemetry-architecture.qd`,
`design/telemetry-storage.qd`.

## Layout

Hexagon + microkernel, enforced by `tests/architecture.rs` — read it before restructuring.

| Path | Holds | Must not import |
|---|---|---|
| `src/types/` | Plain shapes: reading, sensor, threshold, plugin specs, errors. | anything else in the crate, any IO crate |
| `src/kernel/` | Use cases: `ingest`, `readings`, `thresholds`, `sensors`, `actions`, `registration`, `authz`, `registry` + `ports.rs`. | `crate::plugins`, `crate::adapters`, IO crates |
| `src/plugins/` | One file per metric: `temperature`, `air_quality`, `people_count` (+ `common`). | `crate::kernel`, `crate::adapters`, IO crates, **any sibling plugin** |
| `src/adapters/` | Postgres, Kafka, Redis fanout, twin directory, threshold cache, ingest auth, HTTP API. | — |

IO crates the core may never name: `sqlx`, `redis`, `rdkafka`, `axum`, `reqwest`, `prometheus`.

## Invariants

**A building tick is one message end to end.** `/telemetry/ingest` accepts **only** a batch
`{buildingId, readings[]}`; a lone device sends one reading in the array. All-or-nothing:
one bad reading rejects the whole batch, an empty batch is rejected, and a batch over
`MAX_BATCH_READINGS` (500) is rejected before any work. The batch's `buildingId` is stamped
onto every reading; a reading naming another building is rejected.

**One route, not two.** The edge ungates the exact path `/telemetry/ingest`, so a `/batch`
sub-path would 401 for gateways.

**One envelope per tick** on `telemetry_schema::RAW_CHANNEL`, shape
`telemetry_schema::TelemetryEnvelope` — never a hand-rolled `json!`. Channel names come from
`filtered_channel` / `RAW_CHANNEL`, topics from `adapters/topics.rs` (re-exported
`twin_schema` / `telemetry_schema` constants).

**Adding a metric = adding a plugin file, nothing else.** A `SensorPlugin` gives `key`,
`descriptor`, `validate`, `bounds`, optional `actions`; `PluginRegistry::new` rejects two
plugins sharing a key. Plugins never import each other — shared helpers go in
`plugins/common.rs`. `/contracts` serves what the registry holds, and dashboard parses that
same `telemetry_schema` definition, so a rename is a compile error rather than an empty
catalog at runtime.

**Every breach in a tick raises its own alert** to the `alerts` Kafka topic
(`telemetry_schema::{ALERTS_TOPIC, AlertEvent}`). Fan-out to dashboard stays on Redis.

**Ingest auth is device-facing and separate from the gateway JWT**
(`adapters/ingest_auth.rs`): `x-signature`, lowercase-hex SHA-256 HMAC over the body, secret
≥32 bytes, constant-time compare, body capped at 1 MiB. Signatures are pinned to
`schemas/fixtures/internal-signature.json`, the same golden vectors the Go services assert —
changing the scheme breaks both sides at once, by design.

**Registration**: telemetry consumes `building-registration-requested` and answers
`building-registration-completed` (both from `twin_schema`). `maxTemperature` is read here
but never sent by twin, which syncs thresholds over HTTP — keep the field optional, don't
delete it.

## Tests

```bash
just test telemetry               # unit, in-module #[cfg(test)]
just test telemetry-integration   # tests/*.rs against a throwaway TimescaleDB, composed
```

`tests/` covers `api`, `persistence`, `fanout`, `alerts`, `registration`, `architecture`.
Migrations live in `migrations/`.
