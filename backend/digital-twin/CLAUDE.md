# digital-twin

Rust / Axum / MongoDB / Kafka. Owns the building spatial model: upload, provisioning,
rooms, per-domain access. Route `/twin/*`, gated at the edge.
Docs: `documentation/developer/architecture/twin-architecture.qd`.

## Layout

Ports & Adapters, enforced by `tests/architecture_fitness.rs` — read it before restructuring.

| Path | Holds |
|---|---|
| `src/domain/` | `Building`, `AcceptedUpload`, `UploadStatus`, identity, errors. No axum/mongodb, no `crate::{service,adapters}`. |
| `src/service/` | `buildings`, `provisioning`, `authz` + `ports.rs`. No framework, no adapters. `fakes.rs` = doubles. |
| `src/adapters/driving/` | HTTP API, Kafka consumer, `worker.rs` (provisioning loop). Must not reach into `driven`. |
| `src/adapters/driven/` | Mongo persistence + job queue, Kafka producer. |

## Invariants

**Upload is accepted first, provisioned later.** `accept` makes the upload durable before
any work happens; a background worker (`worker.rs`, lease 30s, idle poll 50ms) picks up
`provision_next`. So a crash mid-provision loses nothing — the lease expires and the job is
retried.

**Provisioning is idempotent.** Re-provisioning the same upload converges on one twin;
a redelivered resolution is a no-op. Registration answers arrive over Kafka and can repeat.

**A refused publish fails the upload, not the caller** — the HTTP request already returned;
the failure belongs to the job's status.

**Registration handshake**: twin publishes `building-registration-requested`, telemetry
answers `building-registration-completed`; `resolve` on that answer is what actually marks
the upload ready or failed. Topics and payloads come from `twin_schema` and are re-exported
by `adapters/topics.rs` — never write the topic string here.

**The room set is write-once.** Rooms are created by the upload and never edited afterwards:
there is no room-level write route, and the building's own `PATCH` only touches `name`,
`domains` and the max-temperature clone. `tests/api/rooms.rs` pins both halves.

**`resync` republishes the request for a building that already exists** (needs an editing
role). Use it when telemetry lost a registration, instead of re-uploading.

**Authz is Cedar, in `service/authz.rs`**, over the shared bundle in
`backend/libs/auth-policy`. `in` = entity hierarchy, `.contains()` = set membership — using
`in` for the latter silently denies everything. An unrecognised role is ignored, never a
wildcard grant. Reads are scoped by dropping domains the caller cannot read, not by erroring.

**`Building` / `Room` are not shared shapes.** No other Rust service parses them
(`/domain/{id}` returns `Vec<String>`); the cross-language consumers (agent, frontend) are
held in line by `schemas/fixtures/building.json` via `tests/building_conformance.rs`.

## Tests

```bash
just test twin               # unit, in-module #[cfg(test)]
just test twin-integration   # tests/*.rs against a throwaway Mongo, composed then torn down
```

`tests/` also holds conformance (`building_conformance.rs`, `cedar_conformance.rs`) and
Cucumber features (`cucumber.rs`, `features/`, `steps/`).
