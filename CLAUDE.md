# CLAUDE.md

## Project

CrowdVision — digital-twin facility management. Real-time occupancy and telemetry, 3D
building model, alerting, multi-tenant, RAG assistant.

Source-available, **not** open source (`LICENSE`, `CONTRIBUTING.md`). Single owner, no
external PRs.

Docs are the source of truth for architecture: `documentation/{user,developer}/**.qd`
(Quarkdown, `just docs build`, published at https://nickghignatti.github.io/crowd-vision/).
Read the matching `.qd` page before any non-trivial change; update it in the same change.

Published-site sources: `documentation/**.qd` (guides), `documentation/site/index.html`
(portal), `api/*.yaml` (OpenAPI, with `api/index.html` as their Swagger viewer).
`landing-page/` is **build output only** — gitignored, never edit or commit anything there.
A new `.qd` page must be added to its guide's `_nav.qd`, and a new `api/*.yaml` to the
portal, or it publishes unreachable — `just docs build` fails on either.

## Repository shape

Polyglot monorepo. No root `package.json`, no workspaces — every package installs its own
deps.

- `.moon/workspace.yml` — every package registered once; moon does task cache + affected detection.
- `Justfile` + `just/*.just` — command surface, wraps `mise exec -- moon`.
- `.github/services.json` — single manifest CI reads for lang, image, dockerfile, service deps.

| Package | Stack | Role |
|---|---|---|
| `frontend` | Vue 3 / Vite | SPA: 3D twin, dashboards |
| `backend/claims-gateway` | Go | Keycloak token exchange, mints internal RS256 JWT, `/verify` for the edge |
| `backend/tenancy` | Go / Postgres | Domains, memberships; evaluates Cedar |
| `backend/registry` | Go / Postgres | Org signup + lifecycle (control plane) |
| `backend/provisioner` | Go | Ticker reconciler: pending orgs → running tenancy |
| `backend/digital-twin` | Rust / Axum / Mongo / Kafka | Building spatial model |
| `backend/telemetry` | Rust / Axum / Timescale / Kafka / Redis | Ingestion, thresholds, device actions |
| `backend/dashboard` | Rust / Axum | Per-building telemetry filtering + metric catalog |
| `backend/notification` | Rust / Axum / Mongo / Kafka / Redis | Alert delivery, Web Push |
| `backend/socket` | Rust / Axum / socketioxide / Redis | Real-time transport to browser |
| `backend/chat` | Rust / Axum / Mongo | Chat sessions, SSE streaming, drives `agent` |
| `backend/agent` | Python / FastAPI / pgvector | RAG assistant, LLM tool-calling |
| `backend/libs/{auth-contracts,auth-middleware,auth-policy}` | Go modules | Shared, embedded, never deployed |
| `backend/acceptance` | Python | Cross-service acceptance suite |
| `schemas/{claims,telemetry,twin}-schema` | Rust crates | Shapes crossing a service boundary |
| `schemas/{fixtures,json}` | JSON | Cross-language conformance fixtures + written contracts |
| `simulators/*` | Python / Node | Synthetic telemetry |
| `tooling/eslint-config` | Node | Shared flat ESLint config |

## Commands

```bash
just setup install       # mise install + per-language deps everywhere
just stack env           # generate .env (keys, Keycloak, control plane)
just stack dev           # full compose stack, hot reload
                         # flags: --build --no-agent --no-metrics --no-simulators --dry-run
just stack logs <svc>    # follow one service
just lint fix            # then: just lint affected
just test affected       # mirrors per-service CI legs
just test all
just test <svc>          # chat telemetry twin notification socket frontend agent
just test <svc>-integration   # throwaway DB/broker, composed, then torn down
just test integration    # full backend acceptance suite
just setup deps-check    # lockfile sync gate (mirrors ci-deps)
just setup audit         # npm/uv/cargo audit (mirrors ci-audit)
just docs build          # guides + portal + api specs → landing-page/ (all generated)
just db clear            # drop chat/twin/notification/agent DBs
just k8s create          # local k3d + Istio ambient
```

Single test:

```bash
mise exec -- cargo test test_name                                   # Rust
mise exec -- go test ./internal/service/... -run TestName -v        # Go
mise exec -- uv run --directory backend/agent pytest tests/unit/test_x.py::test_y   # Python
cd frontend && mise exec -- npx vitest run src/path/File.spec.ts -t "name"          # Vue
```

- **Never ambient `PATH`** — `just` recipes or `mise exec -- <tool>`.
- Node dep: install in the service dir, then regenerate the Linux lockfile
  (`just setup clean-install`, or `npm install --prefix <dir> --package-lock-only --cpu=x64 --os=linux`),
  else CI `npm ci` fails. `cargo add` / `go get` in-dir need no lockfile step.
- Rust pinned exact in `.mise.toml`; CI reads the same pin, so clippy matches locally. Bumping is a deliberate commit.
- New package → register in `.moon/workspace.yml` and `.github/services.json`.

## Architecture invariants

Event-driven microservices, database-per-service, frontend decoupled. Compose (local) and
k8s/Istio ambient (prod) held at routing/auth parity — `architecture/overview.qd`,
`architecture/deployment.qd`.

**Identity** (`architecture/auth-architecture.qd`): browser OIDC/PKCE → Keycloak →
`claims-gateway` mints an internal RS256 JWT → edge (Caddy `forward_auth`, Istio in prod)
verifies once and injects `x-gateway-claims`. Downstream services decode that header and
trust it; `claims-gateway` is the only signature verifier. Cookie `authentication_token`
*is* the JWT, TTL 15min, slid by `/gateway/refresh` (needs a still-valid token) — frontend
renews every 10min (`useSessionKeepAlive`, `REFRESH_INTERVAL_MS`) — keep it under `TokenTTL`. `/agent/*` is
ungated and both edges **strip** client-supplied `x-gateway-claims` on it.

**Shared shapes live in `schemas/`, never in `backend/`.** Three layers of defence:
Rust path deps catch Rust↔Rust drift at compile time; `schemas/fixtures/*.json` catch one
language's parser disagreeing with the others (asserted by Go `conformance_test.go`, Rust
`tests/*conformance*.rs`, Python `tests/unit/test_*_conformance.py`);
`schemas/json/*.schema.json` catch a fixture drifting from the written contract.
Hand-written serde, no codegen. A shape only one service parses is a type, not a contract —
leave it in the service.

**Claims parsing**: one definition per language, not per service — Rust `schemas/claims-schema`,
Go `backend/libs/auth-contracts`, Python `agent/app/auth.py`. The crate parses, it does not
police: requiring a field is each service's own extractor's call.

**Internal HMAC** (`X-Signature`, control-plane hops with no end user): one Go implementation
in `auth-contracts` — provisioner and claims-gateway sign, registry and tenancy verify.
Telemetry's device-facing ingest verifier is separate Rust (`adapters/ingest_auth.rs`, own key);
both sides assert `schemas/fixtures/internal-signature.json`.

**Building registration**: twin publishes `building-registration-requested`, telemetry answers
`building-registration-completed`. Payloads *and* topic names come from `schemas/twin-schema`.

**Telemetry**: a building tick is one message end to end. `/telemetry/ingest` takes only a
batch (all-or-nothing); one raw envelope is published per tick. Envelope, reading and channel
names all come from `telemetry_schema` (`TelemetryEnvelope`, `RAW_CHANNEL`, `filtered_channel`).
Dashboard parses the envelope only to key the channel, then republishes the received bytes;
socket relays opaquely.

**Alerts**: telemetry produces every threshold breach to the `alerts` Kafka topic
(`telemetry_schema::{ALERTS_TOPIC, AlertEvent}`); notification consumes, dedupes on a Redis
cooldown, delivers. Redelivery-safe by design.

**Every outbound service-to-service HTTP call sets a timeout.** Neither `reqwest` nor `fetch`
has one by default, and a hang is silent — no error, so no fallback fires.

**Cedar authz** is local, no remote PDP: one shared bundle, `backend/libs/auth-policy`
(`policy.cedar` + `schema.cedarschema`). `in` = entity hierarchy, `.contains()` = set
membership — using `in` for the latter silently denies everything.

**Layering is tested, not documented**: each Rust service has a `tests/architecture*.rs`
fitness test. Read it before restructuring that service. Go control-plane services are Ports
& Adapters: core in `internal/service` / `internal/reconciler`, wired in `cmd/<svc>/main.go`,
real port/adapter split only on the outbound side.

**Routing** (`Caddyfile`, mirrored by `k8s/istio-*.yml`): `/gateway`, `/tenancy`, `/twin`,
`/telemetry`, `/notification`, `/chat` (SSE, needs `flush_interval -1`), `/dashboard`,
`/socket.io`, `/agent` (ungated), `/` → frontend. `/telemetry/ingest` is ungated at the edge
and HMAC-verified in-service — it is one exact path, so a sub-path would 401.
`registry` and `provisioner` have no external route.

## Golden rules

Full text: `contributing/contributing.qd`. A change violating one is rejected regardless of CI.

- **Database-per-service.** Never connect to another service's DB. Use the token, the owning service's API, or a broker event.
- **Stateless services.** All caller authority travels in the token/header.
- **One bounded context per service** (`domain/strategic-design.qd`).
- **Frontend stays lightweight.** No global store (Pinia/Vuex) unless genuinely required — composables and local state.
- **Test what you change.** `#[cfg(test)]` + `tests/` (Rust), `*_test.go` (Go), `tests/` (Python). `just test all` green before a PR. Frontend unit tests are deliberately absent — `frontend:test` runs vitest `--passWithNoTests`; frontend behaviour is covered by `frontend/e2e/` and `backend/acceptance/`.
- **Tools only through mise/just.**
- **Docs change in the same commit as the code**, not after.

## Conventions

- **Commits**: Conventional Commits. Scope = service: `feat(twin): …`. Scopes: gateway, tenancy, registry, provisioner, twin, telemetry, dashboard, notification, socket, chat, frontend, agent, ci, docs, k8s. Not CI-enforced — release-please silently treats a malformed message as no-release.
- **Branches**: `<type>/<short-kebab>` — `feat/private-domains`.
- **Service names carry no `-service` suffix** on any surface: directory, crate, binary, image, hostname, env var, moon project, doc page. Full rules: `contributing/naming-conventions.qd`.
- **Renaming a service renames its compose volume**, which mounts an empty one and orphans the old — migrate the data in the same change (`docker volume ls` shows the orphans). Database names and `system:` identities are deliberately *not* renamed.
- **Kafka consumer groups are named after what they consume**, not who consumes it (`alerts`, `building-registrations`). Renaming one is a replay, not a reset: a group with no committed offsets re-reads the whole topic.
- **`system:notification-service` keeps the old name on purpose** — it is an identity at a trust boundary, pinned byte-for-byte by a test.
- **`scripts/` is Node-free**: POSIX sh for command sequences, stdlib Python for logic (JSON, HTTP, concurrency). Repeated per-project work belongs in a moon task, not a script.

## Working style

- **TDD.** Failing test first, in the language's idiomatic location. No behaviour without a test.
- **No noise comments.** Nothing that restates the code. A `///` doc comment is welcome when it
  records a decision or a trap the next reader would otherwise reintroduce — see
  `chat/src/service/ports.rs`, `telemetry/src/adapters/ingest_auth.rs` for the bar.
- **Docs are terse.** Bullets and tables over prose, one line per fact, no restating. "Why" only when it prevents a real mistake.
- **Batch independent reads into one call.** Several greps, or a grep plus a file listing,
  belong in one `python3` heredoc or one compound command — not four round trips. Only chain
  calls when a later one needs an earlier one's answer.
- **Grep for symbols, not whole files.** `grep -n 'fn \|const \|struct ' src/kernel/ingest.rs`
  gives the shape in ~15 lines; reading the file costs 400. Read in full only what you are
  about to edit.
- **Less code wins.** Delete over add. Know the deps already in `Cargo.toml` / `go.mod` / `package.json` / `pyproject.toml` before writing what already exists.
- **Never `git commit` / `git push`** — hook-enforced deny (`.claude/hooks/block-git-write.sh`). Stage, then hand off.
