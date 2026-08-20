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
| `backend/tenancy-service` | Go / PostgreSQL | Domains & memberships; only Go service evaluating Cedar |
| `backend/registry-service` | Go / PostgreSQL | Org signup & lifecycle (control plane) |
| `backend/provisioner` | Go | Reconcile: pending orgs → running tenancy (pooled tier only) |
| `backend/twin-service` | Rust / Axum / MongoDB / Kafka | Building spatial model |
| `backend/contracts-service` | Rust / Axum / MongoDB | Per-building telemetry-dashboard filtering |
| `backend/telemetry-service` | Rust / Axum / Postgres+Timescale / Kafka / Redis | Telemetry ingestion (readings, thresholds, device actions) |
| `backend/notification-service` | Rust / Axum / MongoDB / Kafka / Redis | Alerting, Web Push |
| `backend/socket-service` | Rust / Axum / socketioxide / Redis | Real-time transport to browser |
| `backend/chat-service` | Node / MongoDB | Chat sessions, orchestrates `agent-service` |
| `backend/agent-service` | Python / FastAPI / PostgreSQL+pgvector | RAG assistant, maintained separately |
| `backend/auth-contracts`, `auth-middleware`, `auth-policy` | Go modules (+Rust/Python Cedar bindings) | Shared libs, embedded not deployed |
| `simulators/*` | Python / Node | Synthetic telemetry generators |
| `tooling/eslint-config` | Node | Shared flat ESLint config |

## Commands

```bash
just setup install     # mise install + npm ci / uv sync / cargo fetch / go mod download, everywhere
just stack env          # generate .env, prompts once
just stack dev           # full compose stack, hot-reload
just stack dev-light     # same, minus agent-service + tracing stack

just test affected        # mirrors per-service CI legs
just test all              # full suite
just test <chat|twin|notification|telemetry|socket|frontend|agent>
just test agent-integration
just test integration           # full backend integration, composed stack
just test twin-integration       # twin-service tests/*.rs against a real Mongo, composed
just test socket-integration      # socket-service tests/*.rs against a real Redis, composed
just test notification-integration # notification-service tests/*.rs against real Mongo+Redis, composed
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
mise exec -- uv run --directory backend/agent-service pytest tests/test_file.py::test_name  # Python
cd backend/<service> && mise exec -- npx jest path/to/file.test.ts -t "test name"           # Node
cd frontend && mise exec -- npx vitest run src/path/to/File.spec.ts -t "test name"          # Vue
```

- **Node dep**: install inside service dir, regen Linux lockfile
  (`just setup clean-install` or
  `npm install --prefix backend/<svc> --package-lock-only --cpu=x64 --os=linux`) — else CI
  `npm ci` fails. Rust/Go: `cargo add`/`go get` in-dir, no lockfile step.
- Go unpinned in `.mise.toml`, fetched on demand.
- New package → register in `.moon/workspace.yml`.

## Architecture

Event-driven microservices, frontend decoupled, database-per-service. Compose (local) and
k8s/Istio (prod) kept at routing/auth parity — diagrams: `architecture/overview.qd`.

**Identity**: Browser OIDC/PKCE → Keycloak → `claims-gateway` mints internal RS256 JWT
(Stable Claims Contract: `{sub, accountName, sid, memberships}`) → edge (Caddy/Istio) verifies
once, injects `x-gateway-claims` header. Downstream services decode header, trust it, never
re-verify. `claims-gateway` = only signature verifier. Session cookie `authentication_token` *is* the JWT, TTL 15min; `/gateway/refresh` slides it but needs a still-valid token. Frontend renews every 10min via `useSessionKeepAlive` (`App.vue`) — keep interval < `TokenTTL`. `agent-service` excluded from edge gate
(own HS256 dev token) — both edges strip client-supplied `x-gateway-claims` on `/agent/*`.

**Cedar authz**: local, no remote PDP. Shared bundle `backend/auth-policy` (see its
`CLAUDE.md`). **`in` = entity-hierarchy, `.contains()` = set membership — using `in` for the
latter silently denies everything.**

**Go control-plane** (`claims-gateway`, `tenancy-service`, `registry-service`, `provisioner`):
Ports & Adapters. Core in `internal/service`/`internal/reconciler`, depends only on its own
interfaces, wired in `cmd/<service>/main.go`. Only outbound side has real port/adapter split —
inbound (`internal/api`) calls core directly. `provisioner`'s driving adapter = ticker loop.

**twin-service** (Rust): same Ports & Adapters shape, test-enforced. Detail in
`backend/twin-service/CLAUDE.md`. **notification-service** (Rust): same shape —
`src/domain/` (pure), `src/service/` (use cases + `Arc<dyn Port>`), `src/adapters/driving/`
(HTTP + Kafka `alerts` consumer), `src/adapters/driven/` (Mongo, Redis bus +
cooldown, web-push, twin lookup), wired in `main.rs`. Test-enforced by
`tests/architecture_fitness.rs`; `x-gateway-claims` literal only in `domain/identity.rs`.
**telemetry-service** (Rust) = hexagon + microkernel on orthogonal axes: `src/contracts/`
(pure types + `SensorPlugin`/`ActionSpec` traits, depends on nothing), `src/kernel/` (use cases
+ `Arc<dyn Port>`, the microkernel — never names a plugin), `src/plugins/` (one file per metric,
never import each other or the kernel), `src/adapters/driven|driving/`, wired in `main.rs`.
Test-enforced by `tests/architecture.rs`. Device vocabulary lives **only** in
`adapters/driven/dispatch.rs` — see `design/sensor-actions.qd`. Storage levers in
`design/telemetry-storage.qd`.
**Breach alerts on Kafka**: every threshold breach goes to the single `alerts` topic, keyed
`buildingId:roomId`, produced enqueue-only (`send_result`) so a broker outage never stalls
`/telemetry/ingest`. notification-service consumes it (group `notification-service-alerts`,
`auto.offset.reset=earliest`) and filters `type == "temperature"`; a breach produced while it
is down is processed on return. Auto-commit and concurrent handling are deliberate — no record
blocks the next. Duplicates are absorbed by the existing Redis cooldown (`temp_alert:<b>:<r>`,
300s). Telemetry fan-out stays on Redis.
`socket-service` (Rust) = functional core / imperative shell,
split as directories: `src/core/` (`auth`/`rooms`/`relay`, pure + unit-tested), `src/shell/`
(`handlers`/`server`/`metrics`/`twin`), `src/main.rs` binds only. Test-enforced by
`tests/architecture.rs`: every `src/*.rs` must live in `core/` or `shell/`; core imports no I/O
crate, no `async fn`, never names `crate::shell`; room-name literals only in `core/rooms.rs`,
`x-gateway-claims` only in `core/auth.rs`. `subscribe_building` authorizes per building:
`shell/twin.rs` resolves building → domains from twin-service (`TWIN_SERVICE_URL`, caller's
claims forwarded, 60s cache — authoritative answers cached incl. empty, failures not),
`core::auth::may_read_building` requires a shared domain. Emit path unchanged, no per-message
check. Sockets dropped after `SOCKET_MAX_LIFETIME_SECS` (default 900, = gateway `TokenTTL`) by a
sweep in `server.rs`; `core/session.rs` jitters per socket so a deploy's clients don't re-expire
in lockstep. Reconnect re-reads the cookie — that is the re-validation. `contracts-service` (Rust) stays flat, no restructure.

**Service mesh**: prod/staging = Istio ambient (`ztunnel` L4 mTLS, no sidecars; optional
`waypoint` for L7). Trust: hard perimeter, guarded interior — edge authenticates once, every
hop mTLS, but any in-mesh workload can still forge `x-gateway-claims` (mTLS authenticates
connection, not payload). Accepted except `agent-service`, restricted by `AuthorizationPolicy`
(untrusted LLM tool-calling input). Revisit if a cluster ever serves >1 tenant.

**Routing** (same table both envs): `/gateway`→claims-gateway, `/tenancy`→tenancy-service,
`/twin`→twin-service, `/telemetry`→telemetry-service (`/telemetry/ingest` ungated), `/notification`,
`/chat`, `/agent` (ungated), `/contracts` (own auth), `/socket.io`, `/`→frontend.
`registry-service`/`provisioner`: no external route, HMAC-only internal calls.

## Golden rules

Violating one won't be accepted regardless of CI status (full detail:
`contributing/contributing.qd`).

- **Database-per-service.** No cross-service DB connection. Need other data? Verified
  token / owning service's API / broker event.
- **Stateless services.** No session state; caller authority in token/header.
- **One bounded context per service** (`domain/strategic-design.qd`).
- **Frontend stays lightweight.** No global store (Pinia/Vuex) unless required;
  composables/local state.
- **Test what you change.** `__tests__/` (TS), `#[cfg(test)]`+`tests/` (Rust), `*_test.go`
  (Go). `just test all` before PR.
- **Tools through mise/just only** — never ambient `PATH`.
- **Never `git commit`/`git push`.** Hook-enforced. Stage, hand off.
- **Docs sync same-change, not after.** Update this file + matching `.qd` page together.
  Hook nudges (`arch-change-reminder.sh`), not a gate.
- **No code comments.** Ever. No exceptions.
- **Docs are caveman-short.** Bullets/tables over prose. One line per fact. No restating.
  No "why" unless it prevents a real mistake.

## Conventions

- **Commits**: Conventional Commits (discipline only, not CI-enforced). Scope = service:
  `feat(twin): …`. Scopes: gateway, tenancy, registry, provisioner, twin, telemetry,
  notification, socket, contracts, frontend, agent, ci, docs, k8s.
- **Branches**: `<type>/<short-kebab>`, e.g. `feat/private-domains`.
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
