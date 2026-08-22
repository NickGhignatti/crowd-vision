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

`router()` in `lib.rs` splits three ways: `public` (health, metrics, contracts), `ingest`
(`/ingest`, HMAC-gated), `protected` (thresholds, sensors, actions, queries).

`/ingest` is ungated at the *edge* but not open: `adapters/ingest_auth.rs` verifies
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

## Breach alerts

Every threshold breach goes to the `alerts` Kafka topic, keyed `buildingId:roomId`, produced
enqueue-only (`send_result`) so a broker outage never stalls `/telemetry/ingest`. Telemetry
fan-out stays on Redis. Consumer side: `backend/notification-service/CLAUDE.md`.

## Tests

`src/` = unit only (`just test telemetry`).
