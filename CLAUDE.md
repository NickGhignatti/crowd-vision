# CLAUDE.md

## Project

CrowdVision: digital-twin facility-management platform. Real-time occupancy, telemetry,
spatial data, 3D model, multi-tenant, AI assistant. Source-available, not open source
(`LICENSE`/`CONTRIBUTING.md`) — no external PRs accepted; submitted anyway → rights-assignment
terms apply.

Full docs: https://nickghignatti.github.io/crowd-vision/ (`documentation/` → Quarkdown,
`just docs build`). Read the relevant `.qd` page before non-trivial architecture changes.

## Repository shape

Polyglot monorepo. No root `package.json`/workspace — every service installs deps
independently.

- **moon** (`.moon/workspace.yml` + `.moon/tasks/*.yml`): task cache, affected-detection.
- **just** (root `Justfile` + `just/*.just`): command surface, wraps moon + `mise exec --`.

| Component | Stack | Role |
|---|---|---|
| `frontend` | Vue 3 / Vite | SPA — 3D digital twin, dashboards |
| `backend/claims-gateway` | Go | IdP token exchange → internal RS256 JWT (only raw JWT verifier) |
| `backend/tenancy` | Go / PostgreSQL | Domains & memberships; only Go service evaluating Cedar |
| `backend/registry` | Go / PostgreSQL | Org signup & lifecycle (control plane) |
| `backend/provisioner` | Go | Reconcile: pending orgs → running tenancy (pooled tier only) |
| `backend/digital-twin` | Rust / Axum / MongoDB / Kafka | Building spatial model |
| `backend/dashboard` | Rust / Axum / MongoDB | Per-building telemetry-dashboard filtering |
| `backend/telemetry` | Rust / Axum / Postgres+Timescale / Kafka / Redis | Telemetry ingestion (readings, thresholds, device actions) |
| `backend/notification` | Rust / Axum / MongoDB / Kafka / Redis | Alerting, Web Push |
| `backend/socket` | Rust / Axum / socketioxide / Redis | Real-time transport to browser |
| `backend/chat` | Rust / Axum / MongoDB | Chat sessions, SSE streaming, orchestrates `agent` |
| `backend/agent` | Python / FastAPI / PostgreSQL+pgvector | RAG assistant, maintained separately |
| `backend/libs/{auth-contracts,auth-middleware,auth-policy}` | Go modules (+Rust/Python Cedar bindings) | Shared libs, embedded not deployed |
| `schemas/telemetry-schema` | Rust crate | Metric catalog, `alerts` topic, telemetry envelope + channel names (telemetry, contracts, notification, socket) |
| `schemas/claims-schema` | Rust crate | `x-gateway-claims` wire types, shared by all six Rust services |
| `schemas/twin-schema` | Rust crate | Building-registration Kafka payloads + topics (twin + telemetry) |
| `schemas/fixtures` | JSON | Cross-language conformance fixtures (Go + Rust + Python assert the same file) |
| `schemas/json` | JSON Schema | Written contract for each shared shape; Rust + Python validate the fixtures against it |
| `simulators/*` | Python / Node | Synthetic telemetry generators |
| `tooling/eslint-config` | Node | Shared flat ESLint config |

## Commands

```bash
just setup install     # mise install + npm ci / uv sync / cargo fetch / go mod download, everywhere
just stack env          # generate .env, prompts once
just stack dev           # full compose stack, hot-reload
just stack dev --no-agent # same, minus agent + its Langfuse/ClickHouse/MinIO stack
                          # also --no-metrics, --no-simulators, --dry-run, --help

just test affected        # mirrors per-service CI legs
just test all              # full suite
just test <chat|twin|notification|telemetry|socket|frontend|agent>
just test agent-integration
just test integration           # full backend integration, composed stack
just test twin-integration       # digital-twin tests/*.rs against a real Mongo, composed
just test socket-integration      # socket tests/*.rs against a real Redis, composed
just test chat-integration        # chat tests/*.rs against a real Mongo, composed
just test notification-integration # notification tests/*.rs against real Mongo+Redis, composed
just setup deps-check      # lockfile-in-sync gate
just setup audit             # npm/uv/cargo audit

just k8s create              # local k3d + Istio ambient
just docs build               # documentation/{user,developer} via Quarkdown
just db clear                     # drop chat/twin/notification/agent DBs
```

Single test:
```bash
mise exec -- go test ./internal/service/... -run TestName -v          # Go
mise exec -- cargo test test_name                                      # Rust
mise exec -- uv run --directory backend/agent pytest tests/test_file.py::test_name  # Python
cd backend/<service> && mise exec -- npx jest path/to/file.test.ts -t "test name"           # Node
cd frontend && mise exec -- npx vitest run src/path/to/File.spec.ts -t "test name"          # Vue
```

- **Node dep**: install inside service dir, regen Linux lockfile
  (`just setup clean-install` or
  `npm install --prefix backend/<svc> --package-lock-only --cpu=x64 --os=linux`) — else CI
  `npm ci` fails. Rust/Go: `cargo add`/`go get` in-dir, no lockfile step.
- Go unpinned in `.mise.toml`, fetched on demand.
- Rust pinned exact in `.mise.toml`; `.github/actions/setup-rust` reads that pin, so CI
  and local run the same clippy. Bumping it is a deliberate commit.
- New package → register in `.moon/workspace.yml`.

## Architecture

Event-driven microservices, frontend decoupled, database-per-service. Compose (local) and
k8s/Istio (prod) kept at routing/auth parity — diagrams: `architecture/overview.qd`.

**Identity**: Browser OIDC/PKCE → Keycloak → `claims-gateway` mints internal RS256 JWT
(Stable Claims Contract: `{sub, accountName, sid, memberships}`) → edge (Caddy/Istio) verifies
once, injects `x-gateway-claims` header. Downstream services decode header, trust it, never
re-verify. `claims-gateway` = only signature verifier. Session cookie `authentication_token` *is* the JWT, TTL 15min; `/gateway/refresh` slides it but needs a still-valid token. Frontend renews every 10min via `useSessionKeepAlive` (`App.vue`) — keep interval < `TokenTTL`. `agent` excluded from edge gate
(own HS256 dev token) — both edges strip client-supplied `x-gateway-claims` on `/agent/*`.

**Shared shapes** live in `schemas/` (see its `CLAUDE.md`), never in `backend/`. Three layers:
Rust path deps catch Rust↔Rust drift at compile time; `schemas/fixtures/*.json` catch a
language's parser disagreeing with the others; `schemas/json/*.schema.json` catch a fixture
drifting from the written contract. Hand-written serde, **no codegen** — four shapes here
cannot come out of a generator. A shape shared by only one Rust service is a type, not a
contract: leave it in the service.

**Claims parsing**: one definition per language, not per service. Rust =
`schemas/claims-schema` (path dep, six consumers); Go = `backend/libs/auth-contracts`; Python =
`agent/app/auth.py`. All three assert `schemas/fixtures/standard-claims.json`,
so a renamed claim fails in every language at once. Header decoding accepts all four base64
alphabets; a malformed membership is dropped, not fatal. Requiring a field (`sub`,
`accountName`) is the service's call, made in its own extractor — the crate parses, it does not
police. `FromRequestParts` is foreign, so each service still owns its `GatewayClaims` wrapper.

**Internal HMAC** (`X-Signature`, control-plane hops with no end user): one Go implementation,
`authcontracts.Sign` / `RequireSignature` — `provisioner`, `claims-gateway` sign;
`registry`, `tenancy` verify. Lives in `auth-contracts`, not `auth-middleware`,
so registry/provisioner don't inherit the JWT deps. `telemetry`'s ingest verifier stays
separate Rust (own key, device-facing) — both sides assert
`schemas/fixtures/internal-signature.json`.

**Building registration**: twin publishes `building-registration-requested`, telemetry answers on
`building-registration-completed`. Both payloads and both topic names are
`schemas/twin-schema`. Rooms parse leniently (no id = dropped, no name = its id).
`maxTemperature` is read by telemetry but never sent by twin, which syncs thresholds over HTTP —
the field stays optional, not deleted. twin's `Building`/`Room` are **not** shared: no other Rust
service parses them (`/domain/{id}` returns `Vec<String>`); the cross-language consumers
(agent, frontend) are held in line by `schemas/fixtures/building.json`.

**Cedar authz**: local, no remote PDP. Shared bundle `backend/libs/auth-policy` (see its
`CLAUDE.md`). **`in` = entity-hierarchy, `.contains()` = set membership — using `in` for the
latter silently denies everything.**

**Go control-plane** (`claims-gateway`, `tenancy`, `registry`, `provisioner`):
Ports & Adapters. Core in `internal/service`/`internal/reconciler`, depends only on its own
interfaces, wired in `cmd/<service>/main.go`. Only outbound side has real port/adapter split —
inbound (`internal/api`) calls core directly. `provisioner`'s driving adapter = ticker loop.

**Rust services**: each enforces its own layering with a `tests/architecture*.rs` fitness test —
read the service's own `CLAUDE.md` before restructuring. `digital-twin`, `notification`,
`chat` = Ports & Adapters. `telemetry` = hexagon + microkernel. `socket`
= functional core / imperative shell. `dashboard` stays flat, no restructure.

**Metric-catalog contract**: `telemetry` `/contracts` and `dashboard`'s parser
share one definition, `schemas/telemetry-schema` (path dependency, both build from repo-root
context). Drift is a compile error, not a runtime `error decoding response body` — which is
exactly how `key`/`metricKey` and `kind`/`type` diverged and emptied the dashboard catalog.
New cross-service JSON between Rust services goes here, not into a hand-rolled `json!`.

**Chat streaming**: `POST /chat/conversations/{id}/messages` is SSE, not JSON — `token` frames
then a terminal `done` (or `error`) frame. Persist only on `done`, so an aborted generation
leaves no half-written message. Pre-stream failures stay ordinary status codes. Needs
`flush_interval -1` at Caddy. Detail: `backend/chat/CLAUDE.md`.

**Telemetry batching**: a building tick is one message end to end. `/telemetry/ingest` takes
**only** a batch — `{buildingId, readings[]}`, all-or-nothing; a lone device sends one reading
in the array. telemetry bulk inserts and publishes one `telemetry:raw` envelope
`{buildingId, ingestedAt, readings[]}`. No shape tag on the envelope: everything is a tick, so
a constant `type` would say nothing — and `type` already means *metric* on each reading.
One definition of the envelope, the reading and the channel names —
`telemetry_schema::{TelemetryEnvelope, TelemetryReading, RAW_CHANNEL, filtered_channel}`.
Plugin fields ride in a flattened map, so a reading round-trips whatever its plugin emitted.
dashboard parses the envelope to key the channel on `buildingId`, then **republishes the
bytes it received** rather than re-serialising; socket relays opaquely. One route, not
two: the edge
ungates the exact path `/telemetry/ingest`, so a `/batch` sub-path would 401 for gateways.
Detail: `backend/telemetry/CLAUDE.md`.

**Breach alerts**: telemetry produces every threshold breach to the `alerts` Kafka topic;
notification consumes and delivers. Redelivery-safe, absorbed by a Redis cooldown.
Telemetry fan-out stays on Redis. One definition of the payload — `telemetry_schema::AlertEvent`
(value keyed by its own metric name, every field required). **Only `temperature` has a delivery
path**; other metrics are logged and counted `unsupported_metric`, not silently skipped. Detail on
each side in the two services' `CLAUDE.md`.

**Every outbound service-to-service HTTP call sets a timeout.** Neither `reqwest` nor Node
`fetch` has one by default, and a hang is silent — no error, so no fallback path fires.

**Service mesh**: prod/staging = Istio ambient (`ztunnel` L4 mTLS, no sidecars; optional
`waypoint` for L7). Trust: hard perimeter, guarded interior — edge authenticates once, every
hop mTLS, but any in-mesh workload can still forge `x-gateway-claims` (mTLS authenticates
connection, not payload). Accepted except `agent`, restricted by `AuthorizationPolicy`
(untrusted LLM tool-calling input). Revisit if a cluster ever serves >1 tenant.

**Routing** (same table both envs): `/gateway`→claims-gateway, `/tenancy`→tenancy,
`/twin`→digital-twin, `/telemetry`→telemetry (`/telemetry/ingest` ungated at the edge,
HMAC `X-Signature` verified in-service), `/notification`,
`/chat`, `/agent` (ungated), `/dashboard` (own auth), `/socket.io`, `/`→frontend.
`registry`/`provisioner`: no external route, HMAC-only internal calls.

## Golden rules

Violating one won't be accepted regardless of CI status (full detail:
`contributing/contributing.qd`).

- **Database-per-service.** No cross-service DB connection. Need other data? Verified
  token / owning service's API / broker event.
- **Stateless services.** No session state; caller authority in token/header.
- **One bounded context per service** (`domain/strategic-design.qd`).
- **Frontend stays lightweight.** No global store (Pinia/Vuex) unless required;
  composables/local state.
- **Test what you change.** `#[cfg(test)]`+`tests/` (Rust), `*_test.go` (Go), `tests/` (Python).
  `just test all` before PR. **Frontend is the exception** — `src/**/__tests__/` was removed
  deliberately; `frontend:test` runs vitest with `--passWithNoTests` and the config is kept so
  a suite can come back without rewiring. Frontend behaviour is covered by `e2e/` and by the
  cross-service acceptance suite (`just test integration`).
- **Tools through mise/just only** — never ambient `PATH`.
- **Never `git commit`/`git push`.** Hook-enforced. Stage, hand off.
- **Docs sync same-change, not after.** Update this file + matching `.qd` page together.
  Hook nudges (`arch-change-reminder.sh`), not a gate.
- **No code comments.** Ever. No exceptions.
- **Docs are caveman-short.** Bullets/tables over prose. One line per fact. No restating.
  No "why" unless it prevents a real mistake.

## Naming

Services are named without a `-service` suffix — directory, crate, binary, image, container
hostname, `services.json` key, moon project and doc page all use the same short name
(`telemetry`, `chat`, `digital-twin`). Libraries live in `backend/libs/`, shared shapes in
`schemas/`, the cross-service suite in `backend/acceptance/`.

Kafka **consumer groups** are named after what they consume, not after the service that
consumes them — `alerts`, `building-registrations`, `building-registrations-completed`. Room
to split later (`alerts:temperature`, `alerts:air-quality`) without renaming anything else.

**One string deliberately keeps the old name:** `system:notification-service`, the `sub`
notification presents when calling other services as a system caller. It is an identity at a
trust boundary, pinned byte-for-byte against the predecessor Node service
(`system_header_matches_the_node_service_byte_for_byte`), and it reads as a stable source in a
central log regardless of what the directory is called.

**Renaming a consumer group is a replay, not a reset.** A group with no committed offsets plus
`auto.offset.reset=earliest` reads the topic from the beginning — so the first deploy after a
group rename re-consumes every retained record. Idempotent for the registration groups
(upserts); for `alerts` it re-delivers historical breaches, collapsed per building:room by the
300s Redis cooldown but not otherwise suppressed.

Database names (`chatdb`, `twindb`, `contractsdb`) and their containers (`twin-db`,
`telemetry-db`) also keep their names: renaming a database is a migration, and none of them
carried a `-service` suffix to begin with.

## Conventions

- **Commits**: Conventional Commits (discipline only, not CI-enforced). Scope = service:
  `feat(twin): …`. Scopes: gateway, tenancy, registry, provisioner, twin, telemetry,
  notification, socket, contracts, frontend, agent, ci, docs, k8s.
- **Branches**: `<type>/<short-kebab>`, e.g. `feat/private-domains`.
- **Tooling scripts**: `scripts/` is Node-free. POSIX sh for command sequences, Python
  (stdlib only — no `pyproject.toml`, run via `mise exec -- python3`) for logic: JSON,
  HTTP, concurrency, string escaping. Needs a data structure → Python. Per-project
  repeated work → a moon task (`:deps`, `:relock`), not a script.
- **Naming** (full: `naming-conventions.qd`): TS `camelCase` files/fns, `PascalCase` models
  (`I`-prefixed interfaces), `UPPER_SNAKE_CASE` consts. Vue `PascalCase` components,
  `View`-suffix pages, `use`-prefix composables. Rust `snake_case` fns, `PascalCase` types,
  `SCREAMING_SNAKE_CASE` consts. Go: file=package, `PascalCase`/`camelCase`=export/unexport,
  no `SCREAMING_SNAKE_CASE`. Go layout: `internal/api`, `internal/service`, `internal/store`
  (+`storefake`), `internal/events`, `internal/config`.

## Development

- **TDD.** Failing test first, in idiomatic location. No behavior without a test.
- **ponytail mandatory**, plugin-enforced. YAGNI, stdlib-first, no unrequested abstractions.
- **Use tools, don't guess.** `graphify query`/`explain` for structure, `/simplify`/
  `ponytail-review` for complexity, `WebSearch` for idiom.
- **Less code wins.** Delete over add. Cheaper algorithm over naive one.
- **Know your deps** before writing something that exists in stdlib/`go.mod`/`Cargo.toml`/
  `package.json`/`pyproject.toml`.

## Token & Performance Optimization

Claude Code only. Enforcement lives in `.claude/` (hooks + one command) — pointers, not
rules to remember.

- **RTK** — every `Bash` call auto-rewritten compact. Hook: `PreToolUse[Bash]` →
  `rtk hook claude`. For big dumps call it directly: `rtk test <cmd>` (failures only),
  `rtk err <cmd>`, `rtk log`, `rtk diff`, `rtk grep`.
- **Caveman** — every response terse. Plugin-enforced (own session hook). Code/commits/
  PRs/security stay full prose. `/caveman lite|full|ultra` to change level.
- **Scout** — read-only lookups (file reads, grep, log output) go through `/scout`:
  `Agent` + `subagent_type: "Explore"` + `model: "haiku"`.
- **Graphify** — query rules in auto-managed `## graphify` section below, don't hand-edit.
  Git post-commit hook re-extracts; never run `graphify update` by hand.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
