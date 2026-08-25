# telemetry

Rust / Axum / Postgres+Timescale / Kafka / Redis. Telemetry ingestion (readings, thresholds,
device actions).

## Shape

Hexagon + microkernel on orthogonal axes:

- `src/types/` — pure types + `SensorPlugin`/`ActionSpec` traits, depends on nothing
- `src/kernel/` — use cases + `Arc<dyn Port>`, the microkernel; never names a plugin
- `src/plugins/` — one file per metric; never import each other or the kernel
- `src/adapters/driven|driving/`
- wired in `main.rs`

Test-enforced by `tests/architecture.rs`.

Device vocabulary lives **only** in `adapters/driven/dispatch.rs` — see `design/sensor-actions.qd`.
Storage levers in `design/telemetry-storage.qd`.

## Routes

`router()` in `lib.rs` splits three ways: `public` (health, metrics, contracts), `ingest`
(`/ingest`, HMAC-gated), `protected` (thresholds, sensors, actions, queries).

**`/ingest` takes a batch, always.** Envelope `{buildingId, readings[]}`, one building tick,
one message. A lone device sends `readings` of length 1 — there is no single-reading route and
no single-reading code path. `Ingest::accept` is the only entry point.

Do **not** add `/ingest/batch` back. The edge ungates the exact path `/telemetry/ingest`
(`handle` in `Caddyfile`, `paths:` in `k8s/istio-request-authentication.yml`) — a sub-path
falls through to `require_gateway_auth` and 401s for a gateway that has no user JWT.

Envelope's building is stamped onto every reading; a reading naming a different one is
rejected (a batch maps to one fan-out channel). All-or-nothing — one bad reading persists
nothing and publishes nothing. Envelope and per-reading errors accumulate into one 422, each
reading's prefixed `readings[{index}]`. Unknown metric is 422-with-index, not 404. Cap
`MAX_BATCH_READINGS` = 500, checked before anything is allocated.

The route sits behind the signature layer: `adapters/ingest_auth.rs` verifies
`X-Signature` = lowercase-hex `HMAC-SHA256(TELEMETRY_INGEST_SECRET, raw_body)` before the
handler. 401 on missing/bad, 413 over 1 MiB. Signature covers the exact wire bytes — sign
the same string you send, never a re-serialised one. `IngestKey::sign` is the one
implementation, used by the verifier and by test/simulator signers.

`TELEMETRY_INGEST_SECRET` is required at boot (min 32 chars) — fail-closed, no "disabled"
mode. Separate key from `INTERNAL_SIGNING_SECRET`: this one leaves the mesh.

Ceilings, both deliberate: one shared secret (so a legitimate gateway can post for a building
that isn't its own — per-building keys are a store lookup behind the same header, no wire
change), and no replay defense (a captured body stays valid, matching the mesh's
"hard perimeter, guarded interior" posture).

`adapters/ratelimit.rs` exists but is still **not wired** — it keys on IP, which is the wrong
key for gateways behind one NAT. Wire it on the signing identity when per-building keys land.
See issue #346.

## Batch fan-out

`Fanout::publish_telemetry` publishes **one** `telemetry:raw` message per tick:
`{buildingId, ingestedAt, readings[]}`. Each element keeps the flat reading shape, so a
consumer walks `readings` and needs nothing else. Both shapes and the channel name are
`telemetry_schema::{TelemetryEnvelope, TelemetryReading, RAW_CHANNEL}` — the envelope is a
struct, not a hand-built `Map`. A plugin's own fields flatten in beside the envelope ones;
`ENVELOPE_FIELDS` still keeps a plugin from overwriting `buildingId`/`roomId`/`timestamp`.

**No `type` on the envelope.** Every message is a tick, so a constant tag carries no
information — and `type` already names the *metric* on each reading, so a second meaning at
the envelope level shadows it. `dashboard::resolve_channel` keys the channel on
`buildingId` alone and gates on `readings` being an array; socket relays opaquely.
Frontend `stores/sensorData.ts` walks `readings`.

`ReadingStore::insert`, `ThresholdStore::resolve` and `Fanout::publish_telemetry` all take
slices — one implementation each, no single/batch pair to drift. `PgReadings::insert` is a
`QueryBuilder::push_values` bulk insert, the hop where batching actually pays.
`PgThresholds::resolve` is one `metric = any / room_id = any` query per tick, room-over-building
picked in memory by `types::threshold::resolve`. The threshold lookup overlaps the write via
`tokio::join!`; alerts and fan-out both wait for it to commit. A failed lookup is logged and skips
breach evaluation for the tick — the readings still land.

## Breach alerts

Every threshold breach goes to the `alerts` Kafka topic, keyed `buildingId:roomId`, produced
enqueue-only (`send_result`) so a broker outage never stalls `/telemetry/ingest`. Telemetry
fan-out stays on Redis. Payload = `telemetry_schema::AlertEvent` (`types::event::AlertPayload`
is a re-export); `alert_json` serialises it, nobody hand-rolls the shape. Consumer side:
`backend/notification/CLAUDE.md`.

## Tests

`src/` = unit only (`just test telemetry`).
