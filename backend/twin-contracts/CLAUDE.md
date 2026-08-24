# twin-contracts

The two Kafka payloads twin-service and telemetry-service exchange, plus the topic names
that carry them. Path dependency, embedded not deployed.

| Topic | Producer | Consumer | Type |
|---|---|---|---|
| `building-registration-requested` | twin | telemetry | `RegistrationRequest` |
| `building-registration-completed` | telemetry | twin | `RegistrationCompleted` |

Topic constants live beside their payload — `telemetry-contracts` owns `ALERTS_TOPIC` the
same way. Each service re-exports them from its own `adapters/topics.rs`; nobody re-declares
the string.

## Rules

- **serde only.** No rdkafka, no axum. The crate names the message, it does not send it.
- **Parse, not validate.** telemetry keeps its own `name: must be a non-empty string.` check —
  that message reaches the user through the `completed` event and twin's upload status.

## Shapes worth knowing

- `RegistrationRequest.rooms` is **lenient**: a room with no id is dropped (it cannot be
  stored or addressed), a room with no name takes its id. Whole-payload rejection over one bad
  room would fail a building for a room nobody asked about.
- `RegistrationRequest.max_temperature` is read by telemetry (it seeds a building temperature
  bound) but **twin does not currently send it** — it syncs thresholds over HTTP instead.
  Optional on purpose; do not delete it without checking `twin-service/src/service/buildings.rs`.
- `RegistrationCompleted::failure()` returns the error when there is one, otherwise the status
  itself, so an unrecognised status never reads as success.

## Not here: `Building`

twin's `Building`/`Room`/`Coordinates`/`Dimensions` stay in `twin-service/src/domain/`. No other
Rust service parses them — telemetry's `/domain/{id}` call returns `Vec<String>`, nothing more.
The consumers that *do* read the full building are `agent-service` (Python) and the frontend
(TypeScript), which cannot share a Rust type; `backend/contracts-fixtures/building.json` is what
holds those three in line, asserted by `twin-service/tests/building_conformance.rs` and
`agent-service/tests/unit/test_building_conformance.py`.

## Consumers

Both build from **repo-root context** — `.github/services.json` carries `cd_context: "."` +
explicit `dockerfile`, and each `Dockerfile` copies this crate before `cargo chef prepare` and
before each `cook`.
