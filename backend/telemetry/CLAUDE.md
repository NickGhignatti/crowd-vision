# telemetry

Rust / Axum / Postgres+Timescale / Kafka / Redis. Ingests sensor readings, owns thresholds,
sensors and device actions, fans out to dashboard and raises alerts. Routes `/telemetry/*`
gated at the edge; `/telemetry/ingest` and `/telemetry/collector` ungated and HMAC-verified in-service.
Docs: `documentation/architecture/telemetry-architecture.qd`,
`design/telemetry-storage.qd`.

## Layout

Hexagon + microkernel, enforced by `tests/architecture.rs` — read it before restructuring.

| Path | Holds | Must not import |
|---|---|---|
| `src/types/` | Plain shapes: reading, sensor, threshold, plugin specs, errors. | anything else in the crate, any IO crate |
| `src/kernel/` | Use cases: `ingest`, `readings`, `thresholds`, `sensors`, `actions`, `registration`, `simulation`, `authz`, `registry` + `ports.rs`. | `crate::plugins`, `crate::adapters`, IO crates |
| `src/plugins/` | One file per metric: `temperature`, `air_quality`, `people_count` (+ `common`). | `crate::kernel`, `crate::adapters`, IO crates, **any sibling plugin** |
| `src/adapters/` | Postgres, Kafka, Redis fanout, twin directory, simulators, threshold cache, ingest auth, HTTP API. | — |

IO crates the core may never name: `sqlx`, `redis`, `rdkafka`, `axum`, `reqwest`, `prometheus`.

## Invariants

**A building tick is one message end to end.** `/telemetry/ingest` accepts **only** a batch
`{buildingId, readings[]}`; a lone device sends one reading in the array. All-or-nothing:
one bad reading rejects the whole batch, an empty batch is rejected, and a batch over
`MAX_BATCH_READINGS` (500) is rejected before any work. The batch's `buildingId` is stamped
onto every reading; a reading naming another building is rejected.

**One route, not two.** The edge ungates the exact path `/telemetry/ingest`, so a `/batch`
sub-path would 401 for gateways.

**`buildingId` rides on the batch, never on a reading.** Three producers in three languages
build this body by hand and no Rust type describes it, so `schemas/fixtures/ingest-batch.json`
pins it — `tests/api.rs` posts every case and every rejection. A reading naming another
building is still refused; producers just stop sending the field that could disagree.

**One envelope per tick** on `telemetry_schema::RAW_CHANNEL`, shape
`telemetry_schema::TelemetryEnvelope` — never a hand-rolled `json!`. Channel names come from
`filtered_channel` / `RAW_CHANNEL`, topics from `adapters/topics.rs` (re-exported
`twin_schema` / `telemetry_schema` constants).

**A sensor is a device, not a metric.** `sensor_type` holds a device kind from
`plugins::devices()`; a router reports `totalDeviceCount` and `ratioDeviceCount`. Every metric
belongs to exactly one device — `DeviceCatalog::new` refuses to start otherwise. Served on
`GET /devices`, kept out of `/contracts` because dashboard parses that shape too. A sensor's
actions are the union of its device's metrics' actions.

**Adding a metric = a plugin file plus its line in `plugins::all()` and a device in
`plugins::devices()`.** A plugin with bounds also
joins `telemetry_schema::ALERTABLE_METRICS` (test-enforced) — that is its delivery path in
notification. A `SensorPlugin` gives `key`,
`descriptor`, `validate`, `bounds`, optional `actions`; `PluginRegistry::new` rejects two
plugins sharing a key. Plugins never import each other — shared helpers go in
`plugins/common.rs`. `/contracts` serves what the registry holds, and dashboard parses that
same `telemetry_schema` definition, so a rename is a compile error rather than an empty
catalog at runtime.

**Every breach in a tick raises its own alert** to the `alerts` Kafka topic
(`telemetry_schema::{ALERTS_TOPIC, AlertEvent}`). Fan-out to dashboard stays on Redis.
A `BoundSpec` compares its own payload `field`, never the reading's `value` — air quality bounds
`co2` as well as `indoor_aqi`. One alert per breached field; the first listed bound wins.
Each alert carries the building and room names from the registration projection
(`BuildingStore::names_of`, cached by `CachedBuildings`); an unregistered room is named by its id.

**Ingest auth is device-facing and separate from the gateway JWT**
(`adapters/ingest_auth.rs`): `x-signature`, lowercase-hex SHA-256 HMAC over the body, secret
≥32 bytes, constant-time compare, body capped at 1 MiB. Signatures are pinned to
`schemas/fixtures/internal-signature.json`, the same golden vectors the Go services assert —
changing the scheme breaks both sides at once, by design.

**Room thresholds are written as a batch.** `PATCH /thresholds/{sensorType}/buildings/{id}/rooms`
takes `{roomId: bounds}` and validates every entry before writing any, so one bad bound rejects
the set. The per-room route stays for single edits. This mirrors ingest: the operation that
naturally arrives as a set is accepted as a set, all-or-nothing. The writes are still one upsert
per room — `ThresholdStore` has no transactional bulk write, and a retry converges.

**Sensors are written as a batch.** `POST /sensors/buildings/{id}` takes `{create, update,
delete}`, validates every item before writing, returns `422` with per-item `{ref, field,
message}` and writes nothing if any item is bad, else applies all in one transaction. Ids are server-generated UUIDs;
`room_id` null = outdoors. Positions live in digital-twin, never here. Actions find the
device by `(building_id, sensor_id)` — never by room, or an outdoor or moved sensor is
unreachable.

**Simulators are told what to simulate at start, and only then.** `PUT /simulation/buildings/{id}`
reads the building's sensors and sends each simulator in `SIMULATORS` the ones whose kind it
claims (body: `schemas/fixtures/simulation-start.json`). Every simulator is told, even with an
empty list — empty means stop, so a removed sensor stops being simulated. Kinds no simulator
claims, and outdoor sensors, are never sent. Calls run concurrently with a 5 s timeout, all
are tried, then any failure is `502`. `Simulation::new` refuses a kind that is not a device, or
one claimed twice (doubled readings). No simulator configured → `404`. The body never
carries coordinates: positions are digital-twin's, not telemetry's.

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
