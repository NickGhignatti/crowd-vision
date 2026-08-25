# dashboard

Rust / Axum / MongoDB. Two jobs: serve the per-building column preferences the dashboard UI
renders, and filter the telemetry stream down to what a building actually subscribed to.
Route `/dashboard*`, gated at the edge.
Docs: `documentation/developer/architecture/dashboard-architecture.qd`,
`design/tunneling.qd`.

## Layout

**Flat on purpose** — `api/`, `infra/`, `models.rs`, `state.rs`, `tunnel.rs`. No hexagon, no
fitness test. Don't restructure it into one; it has no domain logic worth the layers.

## Invariants

**The tunnel republishes the bytes it received.** `tunnel.rs` parses the raw envelope only
far enough to learn the building (and to drop non-ticks), then publishes to that building's
channel — it never re-serialises the readings. A tick for a building with no preferences is
dropped, and a tick never leaks into another building's channel.

**The metric catalog is one shared definition, not a local struct.** `MetricContract` comes
from `telemetry_schema`; telemetry's `/contracts` builds from the same crate. This is exactly
how `key`/`metricKey` and `kind`/`type` once diverged and emptied the catalog at runtime —
keep it a compile error.

**Metric sources are discovered from the environment**: `infra/discovery.rs` collects every
env var whose key ends in `_METRICS_URL`. Adding a source is a compose/k8s change, not a code
change. Duplicates across services are collapsed by `push_unique_metric`.

**Preferences are DashMap-first, Mongo-second.** `AppState.building_preferences` is seeded
once at startup by `load_all`; a write updates the DashMap and returns 200, then upserts to
Mongo in a spawned task whose failure is only logged (`api/data.rs`). So the response does
not mean it was persisted, and a restart replays whatever Mongo actually holds. Deliberate,
and the reason CI needs no Mongo for this service (`needs_mongo: false`) — but it is where a
lost preference would come from.

**Initialising a building is idempotent**: a second init keeps the existing columns; a new
building gets exactly `room name` and `max occupancy`.

**Catalog collection is failure-tolerant and time-bounded**: one `reqwest::Client` with a
2s per-request timeout, and any unreachable, slow or unparseable source yields an empty Vec
rather than failing the request. A hung service cannot stall the dashboard.

## Tests

```bash
mise exec -- moon run dashboard:test   # unit only, in-module #[cfg(test)]
                                       # no `just test dashboard` recipe exists
```

No `tests/` directory and no integration leg. Unit tests build an `AppState` against a
`Collection` handle without ever connecting (the mongodb driver connects lazily, and the
write path is fire-and-forget), which is why the CI leg runs with no Mongo.
