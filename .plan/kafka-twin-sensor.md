# Kafka event log: twin-service -> sensor-service

Goal: replace the synchronous REST call twin-service makes to sensor-service during
building provisioning with an async Kafka event, without weakening the guarantee
that exists today (a failed sensor-side write fails the whole provisioning job).

Scope: only the **registration** sensor threshold clone (the one call inside
`provision()`). `clone_thresholds` is also called five more times from
`service/buildings.rs` on every later geometry edit (`update`, `create_room`,
`update_room`, `delete_room`, `replace_rooms`) — those stay REST via
`DownstreamSync`, unchanged. `contracts-service` prefs/room-threshold seeding
also stays REST, best-effort, unchanged — out of scope.

## Status

- **K1** done — Kafka in root `docker-compose.yml` (shared infra, alongside
  `redis`); `rdkafka` in twin-service, verified against a real broker.
- **K2** done — `service::ports::RegistrationEvents` + `adapters/driven/kafka_producer.rs`;
  `provision()` publishes instead of calling `clone_thresholds`. `DownstreamSync`
  and `clone_thresholds` **kept** (see Scope above — removing them would have
  broken `buildings.rs`'s five update-path calls, which are out of scope here).
- **K3** done — sensor-service: `src/config/kafka.ts` (client), `src/consumers/registrationConsumer.ts`
  (new driving adapter), `src/services/buildingRegistration.ts` (use case, extracted
  so the REST route and the consumer share one code path), `docker-compose.yml`
  wired to `kafka`. Verified live (real docker build, real broker, real Mongo
  write, not just mocked unit tests): consumer crashed on first boot with
  `UNKNOWN_TOPIC_OR_PARTITION` — `KAFKA_AUTO_CREATE_TOPICS_ENABLE` is lazy, and
  the first-ever subscribe to a never-produced topic can race the broker's own
  creation of it. Fixed with an explicit, idempotent `admin.createTopics()` in
  `connectKafka()` before anything subscribes or sends. After the fix: real
  end-to-end pass — published `building-registration-requested`, sensor-service
  wrote a real `buildingthresholds` document, published `building-registration-completed`
  with `status: "ready"`, consumed and confirmed. Failure path (`status: "failed"`)
  is unit-tested (mocked) but not yet exercised live.
- **K4**, **K5** not started.

## The ordering question, answered

Fire the event **after** `buildings.upsert()` succeeds inside `provision()`, not at
message receipt. Your instinct was right, here's why precisely:

- "Message receipt" isn't really a separate moment in this system — the HTTP
  request already causes a durable Mongo write (`pending_uploads`, the existing
  outbox) before the client gets `202`. That part doesn't change.
- The only new question is: when does the *worker* — which already runs
  `provision()` once per claimed upload — tell sensor-service? Answer: only once
  `buildings.upsert()` (the twin's own write) has actually succeeded. Publishing
  before that risks exactly the inconsistency you flagged: a twin write failure
  after sensor-service already built a model for a building that doesn't exist.
- This requires no new infrastructure — `provision()` already sequences
  "write, then call sensor-service" today. The event just replaces the HTTP call
  in that same position.

## Correlated, not blocking

Nobody waits. Two separate, non-blocking hops:

- **Publish**: `provision()` produces `building-registration-requested` and
  returns — it does not sit idle for a reply. The worker tick that used to
  `await` a `reqwest` round-trip now returns as soon as the message is handed
  to the broker. This is where "faster" comes from.
- **Consume, later, whenever**: a new driving adapter (parallel to
  `worker.rs` — a loop, not a socket) consumes
  `building-registration-completed` independently, on its own schedule, and
  calls the *existing* `mark_ready`/`mark_failed` on `UploadQueue`. This isn't
  twin-service "waiting" — it's a separate process reacting to an event
  whenever it shows up, same as the worker already reacts to a claimed upload.

The two are still **correlated** (same `buildingId`, so the client's status
poll eventually reflects sensor-service's real outcome) without either service
ever blocking a thread or a request on the other. That correlation is *why*
this fails the job on a real sensor-side error instead of silently reporting
`"ready"` too early — dropping it would repeat the exact inconsistency you
flagged in the ordering question above, just moved to the other end of the
flow. Async and correlated aren't in tension; blocking and correlated would
be, and nothing here blocks.

## Kafka vs gRPC

Kafka. gRPC's native shape is request/response — synchronous, both ends
reachable at call time. Getting non-blocking correlation out of gRPC means
building a callback/job system on top of it, which is exactly what Kafka
already provides:

- **No log, no replay.** A failed gRPC call is just gone unless you build your
  own retry+durable-queue on top — which is the outbox you already have,
  reinvented.
- **No fan-out.** A future third consumer of "building registered" (contracts-service, notification-service) subscribes to the same topic and twin-service changes nothing. With gRPC, twin-service would call each one explicitly.
- **Matches the actual goal.** The ask was an event log and decoupling, not a faster synchronous call — gRPC only helps with the latter (better wire format over HTTP/2), and this system doesn't have a latency problem with the RPC itself, it has a coupling problem.

## Topics

| Topic | Producer | Consumer | Key | Payload |
|---|---|---|---|---|
| `building-registration-requested` | twin-service | sensor-service | `buildingId` | `{ buildingId, name, rooms: [{ id, name }] }` |
| `building-registration-completed` | sensor-service | twin-service | `buildingId` | `{ buildingId, status: "ready" \| "failed", error? }` |

No `maxTemperature` on the requested event — `provision()` never has one to
send (matches the old `clone_thresholds(&building, None, ...)` call it
replaces); the five `buildings.rs` update paths that *do* sometimes carry one
stay on the REST `DownstreamSync` call, out of scope here.

No `x-gateway-claims` on either payload — Kafka is internal transport between
two services already inside the trust perimeter (same trust model as the
service mesh's "guarded interior"), not a client-facing hop. The REST call
forwarded claims because it was a same-shaped HTTP request; an event doesn't
need to carry a caller identity sensor-service has no use for.

Both topics keyed by `buildingId` so a broker with >1 partition still delivers
one building's events in order. Auto topic creation on for local dev (no
separate provisioning step); revisit before any shared/staging cluster.

## Docker compose

Kafka container (single-node, KRaft mode — no Zookeeper) lives in the **root**
`docker-compose.yml`, alongside `redis` — shared infra, not owned by one
service, even though only twin-service and sensor-service depend on it today.
`twin-service`'s own fragment adds `KAFKA_BROKERS=kafka:9092` and
`depends_on: kafka (condition: service_healthy)`; `sensor-service`'s fragment
will do the same. Cross-fragment `depends_on` works because the orchestrator
merges every fragment into one `compose.runtime.yml` before `docker compose`
ever runs (see `docker-compose.qd`), and the root file is always included
regardless of `exclude=`, so the reference always resolves.

## Code touch points

**twin-service** (Rust) — done:
- `service::ports::RegistrationEvents` — `publish_requested(&Building) -> anyhow::Result<()>`. Separate from `DownstreamSync`, kept alongside it (not a replacement — see Scope).
- `adapters/driven/kafka_producer.rs` — `KafkaEventProducer` implementing it (`rdkafka`). Has a `disabled()` mode (holds `producer: None`) so the HTTP/cucumber suites, which link a lib build without `service::fakes`, can use the real adapter type as a no-op — same trick `OutboundConfig.sync_enabled` already uses.
- `service::provisioning::provision()`: calls `events.publish_requested(&building)` in addition to (not instead of) the existing `downstream.init_preferences` call. `clone_thresholds` was only ever called here for the registration path, so nothing else changed in `provision()`.
- `service::fakes::FakeEvents` — the `#[cfg(test)]` fake for the core-only unit suite.
- `main.rs`: builds the producer from `KAFKA_BROKERS`, passes it into `Provisioning::new`.
- `Cargo.toml`: `rdkafka` (default features: `libz`, `tokio`). `Dockerfile`: `build-essential` added to the `chef` stage (rdkafka-sys compiles librdkafka's C sources at build time).
- Not yet built: the consumer half (`adapters/driving/kafka_consumer.rs`) — that's K4.

**sensor-service** (Node) — done:
- `src/config/kafka.ts` — shared `kafkajs` client, producer, and consumer instances (mirrors `config/redis.ts`'s pattern), plus the two topic-name constants.
- `src/services/buildingRegistration.ts` — `registerBuilding(kernel, buildingId, payload)`, extracted out of `thresholdController.ts`'s `registerBuilding` handler so the REST route and the new consumer share one code path (same "one use case, multiple driving adapters" shape twin-service uses for its worker/HTTP pair).
- `src/consumers/registrationConsumer.ts` — consumes `building-registration-requested`, calls the shared use case, publishes `building-registration-completed` with `status: "ready"` or `"failed"`.
- `src/controllers/thresholdController.ts`: `registerBuilding` handler now delegates to the shared service function; `PUT /thresholds/buildings/:buildingId` unchanged otherwise.
- `src/index.ts`: connects Kafka and starts the consumer alongside Mongo/Redis (still gated by `NODE_ENV !== "test"`).
- `package.json`: `kafkajs`. `docker-compose.yml`: `KAFKA_BROKERS=kafka:9092` + `depends_on: kafka (condition: service_healthy)`.

## Rollout order

- **K1** (done) — Kafka in root compose (shared, alongside `redis`) + `rdkafka` in twin-service. No behavior change; just infrastructure up.
- **K2** (done) — twin-service: `RegistrationEvents` port + Kafka producer adapter; `provision()` publishes in addition to its existing calls. `DownstreamSync`/`clone_thresholds` untouched (still needed by `buildings.rs`).
- **K3** (done) — sensor-service: Kafka consumer wired to the existing threshold-update logic (extracted into a shared use case); publishes the completion event.
- **K4** — twin-service: Kafka consumer (new driving adapter, `adapters/driving/kafka_consumer.rs`) consumes `building-registration-completed` and flips `pending_uploads` status via the existing `mark_ready`/`mark_failed`. Until this lands, `provision_next` still marks a registration `ready` immediately after publish, same as before K2 — the status doesn't yet reflect sensor-service's real outcome.
- **K5** — Confirm redelivery-safety on both sides now that the full loop is live (see Open Questions), and decide whether the registration path's `clone_thresholds`-shaped REST fallback is still needed anywhere.
- **K6** — Docs: `twin-architecture.qd`, `digital-twin.qd`, `sensor-architecture.qd`, `data-flow.qd`, `docker-compose.qd`, `CLAUDE.md`.

Say which step (`K4`, `K5`, ...) to start on.

## Open questions (your call)

- **Status granularity**: reuse `UploadStatus::Pending` for "twin wrote, waiting on sensor" (no new variant, simplest, status API unchanged), or add a distinct value for observability? Leaning reuse — nothing today needs to tell the two "pending" reasons apart.
- **Kafka down at produce time**: treat like today's REST failure — job fails (`bail!`), same guarantee. `rdkafka`'s built-in producer retries happen before that point, no new retry logic needed here.
- **Consumer idempotency on both sides**: redelivery must not corrupt state. Sensor-service's update is already an upsert keyed by `buildingId` (existing behavior). Twin-service's `mark_ready`/`mark_failed` need confirming they're no-ops on an already-resolved upload (existing lease/status logic likely already covers this — check before K4).
