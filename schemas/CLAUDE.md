# schemas

Every shape that crosses a service boundary. One file for the whole directory — the three
crates are one `lib.rs` each, and their rules only make sense together.
Docs: `documentation/packages/{claims,telemetry,twin}-schema.qd`.

## What belongs here

A shape **two or more services parse**. A shape only one service parses is a type, not a
contract — leave it in the service (twin's `Building` is the worked example: it stays in
digital-twin, because no other Rust service reads it).

Hand-written serde, **no codegen**. Four shapes do not justify a generator, and every one of
them has a wire quirk a generator would flatten.

## Three layers of defence

| Layer | Catches | Where |
|---|---|---|
| Rust path deps | Rust↔Rust drift, at compile time | `Cargo.toml` `path = "../../schemas/…"` |
| `fixtures/*.json` | one language's parser disagreeing with the others | Go `conformance_test.go`, Rust `tests/conformance.rs`, Python `tests/unit/test_*_conformance.py` |
| `json/*.schema.json` | a fixture drifting from the written contract | `twin-schema/tests/building_schema.rs`, agent's `test_schema_conformance.py` |

Change a shared shape → change fixture and schema in the same commit, or one of the three
layers fails and tells you exactly which language disagrees.

**JSON Schema validation lives in the crate, not in a service.** Pulling `jsonschema` into
digital-twin unified cargo features on `reqwest` and left its runtime client without a rustls
provider. `twin-schema` validates fixture-against-schema; digital-twin keeps only the half
that needs its own type.

## claims-schema

`CLAIMS_HEADER`, `ClaimsPayload`, `Membership`. Six Rust consumers.

- **Parses, never polices.** Every field is `Option`; requiring `sub` or `accountName` is the
  service's own extractor's decision.
- **A malformed membership is dropped, not fatal** (`lenient_memberships`) — one bad entry
  cannot lock a user out of everything.
- **All four base64 alphabets are accepted** (standard/url-safe × padded/unpadded), because
  the header's producer is not always the same edge.
- The one definition per language: Go `backend/libs/auth-contracts`, Python `agent/app/auth.py`.
  All three assert `fixtures/standard-claims.json`.

## telemetry-schema

Two wire families plus the metric catalog. Consumers: telemetry, dashboard, socket, notification.

- **`AlertEvent` has a hand-written `Serialize`/`Deserialize` because the value is keyed by
  its own metric name** — `{"buildingId", "roomId", "<metric>": value, "type": "<metric>",
  "direction": "high"|"low", "threshold", "timestamp"}`. `type` means *metric*. Derive would
  produce a different shape; don't "simplify" it back.
- **`TelemetryEnvelope` / `TelemetryReading` carry no shape tag** — everything is a tick, so a
  constant `type` would say nothing, and `type` already means metric on a reading. Plugin
  fields ride in a `#[serde(flatten)]` map, so a reading round-trips whatever its plugin emitted.
- **Channel names are functions, not strings**: `RAW_CHANNEL`, `filtered_channel(building)`,
  `building_of_filtered_channel(channel)`. Topics: `ALERTS_TOPIC`, `ALERTS_DLQ_TOPIC`.
- **`MetricContract` is camelCase on the wire** (`metricKey`, `interfaceName`, field `type`).
  This is the drift that once emptied the dashboard catalog at runtime — `key`/`metricKey`,
  `kind`/`type`. Both sides now build from this struct, so it is a compile error instead.
- **`MetricsDiscoveryResponse` is `untagged`**: a source may answer with
  `{service, metrics[]}` or a bare array. Keep both variants.

## twin-schema

The building-registration handshake. Consumers: digital-twin, telemetry.

- **Topics live with the payloads**: `BUILDING_REGISTRATION_REQUESTED_TOPIC`,
  `BUILDING_REGISTRATION_COMPLETED_TOPIC`, plus `STATUS_READY` / `STATUS_FAILED`.
- **Rooms parse leniently** (`usable_rooms`): no id → dropped, no name → its id. A partial
  upload registers what it can rather than failing the building.
- **`maxTemperature` is optional and stays optional** — telemetry reads it, twin never sends
  it (thresholds sync over HTTP). Deleting the field breaks the read side for no gain.

## Adding or changing a shape

1. Change the Rust type (or add the crate) — Rust consumers now fail to compile until updated.
2. Update `fixtures/*.json` and, if the shape has one, `json/*.schema.json`.
3. Run the other languages' conformance tests: `just test agent`, `mise exec -- go test ./...`
   in `backend/libs/auth-contracts`.
4. New crate → register in `.moon/workspace.yml` and `.github/services.json`
   (`builds_binary: false`).
