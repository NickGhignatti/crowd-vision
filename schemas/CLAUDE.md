# schemas

Every shape that crosses a service boundary. One file for the whole directory — the three
crates are one `lib.rs` each, and their rules only make sense together.
Docs: `documentation/packages/{claims,notification,telemetry,twin}-schema.qd`.

## What belongs here

A shape **two or more services parse**. A shape only one service parses is a type, not a
contract — leave it in the service (twin's `Building` is the worked example: it stays in
digital-twin, because no other Rust service reads it).

**A shape one service parses but several *produce* belongs here too**, as a fixture with no
crate: `fixtures/ingest-batch.json` is built by ap-collector, aq-simulator and
sensor-simulator in three languages, and a rename in any of them stops readings arriving with
nothing failing to compile.

**The Cedar bundle is the exception — it stays in `backend/libs/auth-policy`.** Its fixture
holds golden *decisions*, not a wire shape, is meaningless without `policy.cedar` and
`schema.cedarschema` beside it, and Go imports the package as a real module. Don't move it here.

Hand-written serde, **no codegen**. Four shapes do not justify a generator, and every one of
them has a wire quirk a generator would flatten.

## Three layers of defence

| Layer | Catches | Where |
|---|---|---|
| Rust path deps | Rust↔Rust drift, at compile time | `Cargo.toml` `path = "../../schemas/…"` |
| `fixtures/*.json` | one language's parser disagreeing with the others | Go `conformance_test.go`, Rust `tests/*conformance*.rs`, Python `tests/unit/test_*_conformance.py`, TS `frontend/src/utils/**/*.spec.ts` |
| `json/*.schema.json` | a fixture drifting from the written contract | `twin-schema/tests/building_schema.rs`, `claims-schema/tests/{tenancy_domains,chat_conversation}_schema.rs`, `telemetry-schema/tests/{metric_contract,ingest_batch,telemetry_envelope}_schema.rs`, `notification-schema/tests/notification{,_preferences}_schema.rs`, agent's `test_schema_conformance.py` (claims, building, agent-stream) |
| the served bytes | a producer drifting from the fixture both sides agreed on | telemetry `tests/api.rs` compares `/contracts` against `fixtures/metric-contract.json`, and posts every `fixtures/ingest-batch.json` case; notification's `controllers.rs` posts every `fixtures/notification-preferences.json` request and rejection |
| the producer's own output | a hand-built payload drifting from the fixture | agent's `test_stream_conformance.py` runs `stream_answer` and compares the frames; chat's `agent.rs` tests replay them through the real `SseReader`; chat's `conversation.rs` round-trips every `fixtures/chat-conversation.json` shape through its own types; telemetry's `redis_fanout.rs` publishes every `fixtures/telemetry-envelope.json` tick byte for byte; notification's `alerts.rs` publishes a breach and compares it to `fixtures/notification.json`; socket's `relay.rs` routes every case and skips every rejection |

A fixture with a `rejected` block asserts the schema **refuses** what the service refuses, so a
rule is never written in only one language — `ingest-batch` is the worked example.

A `tolerated` block is its mirror, for a shape whose consumer is deliberately lenient: those
frames must **validate and be survived**, so leniency stays a decision rather than a habit.
`agent-stream` is the worked example — chat ignores an unknown frame type and defaults an
absent `answer` so agent can add a frame kind without a lockstep release.

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
- Also hosts the schema check for `fixtures/tenancy-domains.json` (tenancy ↔ frontend), which has
  no Rust type: tenancy's `wire_test.go` and the frontend's `src/utils/domains.spec.ts` bind it.
- Also hosts the schema check for `fixtures/chat-conversation.json` (chat ↔ frontend): chat is
  its only Rust reader, and its `conversation.rs` tests and `src/utils/chat.spec.ts` bind it.
- The one definition per language: Go `backend/libs/auth-contracts`, Python `agent/app/auth.py`.
  All three assert `fixtures/standard-claims.json`.

## telemetry-schema

Two wire families plus the metric catalog. Consumers: telemetry, dashboard, socket, notification.

- **`AlertEvent` has a hand-written `Serialize`/`Deserialize` because the value is keyed by
  the field that breached** — `{"buildingId", "roomId", "<field>": value, "type": "<metric>",
  "field", "label", "unit"?, "direction": "high"|"low", "threshold", "timestamp"}`. `type`
  means *metric*; one metric can bound several fields (air quality: `co2`, `indoor_aqi`).
  `field`/`label`/`unit` are optional on read — older records lack them and read as the metric.
  Derive would produce a different shape; don't "simplify" it back.
- **`TelemetryEnvelope` / `TelemetryReading` carry no shape tag** — everything is a tick, so a
  constant `type` would say nothing, and `type` already means metric on a reading. Plugin
  fields ride in a `#[serde(flatten)]` map, so a reading round-trips whatever its plugin emitted.
- **Channel names are functions, not strings**: `RAW_CHANNEL`, `filtered_channel(building)`,
  `building_of_filtered_channel(channel)`. Topics: `ALERTS_TOPIC`, `ALERTS_DLQ_TOPIC`.
- **Every metric-catalog field is one word**, so the Rust name *is* the wire name and no
  `#[serde(rename)]` survives: `kind`, `label`, `interface`, `unit`, `source`, and `r#type`
  (the raw identifier serialises as `type`, which a keyword otherwise forces you to rename).
  A multi-word field would reintroduce a rename that only the fixture reads — don't add one.
  This is the drift that once emptied the dashboard catalog at runtime — `key`/`metricKey`,
  `kind`/`type`. Both sides now build from this struct, so it is a compile error instead.
  `fixtures/metric-contract.json` pins the bytes for the frontend, which cannot share the struct;
  `frontend/src/utils/metrics.spec.ts` binds it.
- **`fixtures/telemetry-envelope.json` pins what the browser receives.** The frontend reads ticks
  only through `src/utils/telemetry.ts`; a tick is never a reading, it has no `type`.
  `buildingId` and `ingestedAt` live on the envelope only, never repeated on a reading.
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

## notification-schema

`NOTIFICATIONS_CHANNEL`, `Notification`, `Severity`. Consumers: notification (producer), socket.

- **One message, two deliveries.** The Redis publish and the Web Push payload are the same
  bytes; there is no separate push shape.
- **`type` is severity**: `info | warning | danger`, closed. The metric is a preference's
  `notificationType`; don't conflate them.
- **socket parses it to route, then relays the received bytes.** A message that is not a
  `Notification` is skipped, never broadcast: a renamed `domainName` would otherwise send one
  tenant's alert to every client.
- `domainName` and `icon` are optional and omitted when absent.
- Also hosts the schema check for `fixtures/notification-preferences.json`, which has no type
  here: only notification parses it in Rust.

## Adding or changing a shape

1. Change the Rust type (or add the crate) — Rust consumers now fail to compile until updated.
2. Update `fixtures/*.json` and, if the shape has one, `json/*.schema.json`.
3. Run the other languages' conformance tests: `just test agent`, `mise exec -- go test ./...`
   in `backend/libs/auth-contracts`.
4. New crate → register in `.moon/workspace.yml` and `.github/services.json`
   (`builds_binary: false`).
