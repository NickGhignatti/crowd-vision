# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CrowdVision is a digital-twin / facility-management platform: real-time building occupancy,
environmental telemetry, and spatial data, visualized as an interactive 3D model, with
role-based multi-tenant access and an AI assistant. It is **source-available, not open
source** (see `LICENSE`/`CONTRIBUTING.md`) — external pull requests are not currently
accepted; any contribution submitted anyway is accepted only under the rights-assignment
terms in `CONTRIBUTING.md`.

Full docs (setup, architecture, API reference) live at
https://nickghignatti.github.io/crowd-vision/, generated from `documentation/` via Quarkdown
(`just docs build`). Read the relevant `.qd` page under `documentation/developer/` before
making non-trivial architectural changes — most of what's below is a condensed pointer into
that source of truth, not a replacement for it.

## Repository shape

Polyglot monorepo, **no root `package.json` and no npm/pnpm workspaces** — every service
installs its own dependencies independently. Orchestration is two-layered:

- **moon** (`.moon/workspace.yml` registers every project; `.moon/tasks/*.yml` define the
  per-language `build`/`test`/`lint`/`lint-fix`/`deps`/`audit` tasks each project inherits) —
  handles task caching and affected-detection.
- **`just`** (root `Justfile` + `just/*.just` modules) — the actual command surface; wraps
  moon and `mise exec --` so you never rely on ambient `PATH`.

| Component | Stack | Role |
|---|---|---|
| `frontend` | Vue 3 / Vite | SPA — 3D digital twin, dashboards |
| `backend/claims-gateway` | Go | IdP token exchange → internal RS256 JWT (the only service that verifies a raw JWT signature) |
| `backend/tenancy-service` | Go / PostgreSQL | Domains & memberships; the only Go service that evaluates Cedar |
| `backend/registry-service` | Go / PostgreSQL | Organization signup & lifecycle (control plane, never in a cell) |
| `backend/provisioner` | Go | Reconcile loop: pending orgs → running tenancy (pooled tier only today) |
| `backend/twin-service` | Rust / Axum / MongoDB | Building spatial model |
| `backend/contracts-service` | Rust / Axum / MongoDB | Per-building telemetry-dashboard filtering |
| `backend/sensor-service` | Node / Express / MongoDB | Telemetry ingestion (readings, thresholds) |
| `backend/notification-service` | Node / Express / MongoDB | Alerting, Web Push delivery |
| `backend/socket-service` | Node / Socket.IO | Real-time transport to the browser |
| `backend/chat-service` | Node / MongoDB | Persists chat sessions, orchestrates `agent-service` |
| `backend/agent-service` | Python / FastAPI / PostgreSQL+pgvector | RAG assistant; maintained separately from the rest |
| `backend/auth-contracts`, `auth-middleware`, `auth-policy` | Go modules (+ Rust/Python Cedar bindings) | Shared libraries, embedded — not independently deployed |
| `simulators/*` | Python (`aq-simulator`), Node (`sensor-simulator`) | Synthetic telemetry generators |
| `tooling/eslint-config` | Node | Shared flat ESLint config, `@crowdvision/eslint-config` |

## Commands

Bootstrap once:
```bash
just setup install     # mise install + npm ci / uv sync / cargo fetch / go mod download, everywhere
just stack env          # generate .env (VAPID keys, Keycloak/control-plane secrets, prompts once)
just stack dev           # full docker-compose dev stack, hot-reload
just stack dev-light     # same, minus agent-service + its Langfuse/ClickHouse/MinIO tracing stack
```

Lint / test (moon-cached; `affected` scopes to what changed on the current branch):
```bash
just lint fix            # format + autofix everywhere (always runs, not cached)
just lint affected        # mirrors ci-lint
just test affected        # mirrors the per-service CI test legs
just test all              # full suite
just test <chat|twin|notification|sensor|socket|frontend|agent>   # one service's unit tests
just test agent-integration   # agent-service's separate integration suite
just test integration           # full backend integration suite against a composed stack
just setup deps-check      # npm ci / uv sync --locked / cargo check — lockfile-in-sync gate
just setup audit             # npm / uv / cargo audit (no Go leg yet)
```

Running a single test, per language (run inside the service directory, or point at it):
```bash
# Go
mise exec -- go test ./internal/service/... -run TestName -v

# Rust
mise exec -- cargo test test_name

# Python (agent-service, uv-managed)
mise exec -- uv run --directory backend/agent-service pytest tests/test_file.py::test_name

# Node (Jest — chat/notification/sensor/socket-service)
cd backend/<service> && mise exec -- npx jest path/to/file.test.ts -t "test name"

# Vue frontend (Vitest)
cd frontend && mise exec -- npx vitest run src/path/to/File.spec.ts -t "test name"
```

Other:
```bash
just k8s create              # spin up local k3d cluster + Istio ambient (see just k8s --list)
just docs build               # build documentation/{user,developer} via Quarkdown
just db clear                     # drop chat/twin/notification/agent databases
```

.box notes worth internalizing before you push:
- **No root `package.json`.** Add a Node dependency inside that service's directory
  (`cd backend/chat-service && npm install <pkg>`), then regenerate the lockfile for Linux
  before committing (`just setup clean-install`, or
  `npm install --prefix backend/<svc> --package-lock-only --cpu=x64 --os=linux`) —
  otherwise CI's `npm ci` fails on missing Linux optional packages. Rust/Go don't have this
  pitfall: `cargo add` / `go get` inside the service dir is enough.
- **Go isn't pinned in `.mise.toml`**; its modules are fetched on demand (see
  `documentation/developer/config/setting-up.qd`).
- Register any new package in `.moon/workspace.yml` — moon and `just setup install` both
  derive their project list from it.

## Architecture

CrowdVision is **event-driven microservices**, frontend fully decoupled from backend,
database-per-service. The two deployment models (docker-compose locally, Kubernetes/Istio
in prod) are kept at routing/auth parity — see
`documentation/developer/architecture/overview.qd` for the full diagrams.

**Identity flow**: Browser does OIDC/PKCE against **Keycloak** → `claims-gateway` exchanges
the ID token for a fixed-shape internal RS256 JWT (the **Stable Claims Contract**, frozen by
`auth-contracts`: `{sub, accountName, sid, memberships}`) → every other request passes
through the edge (Caddy `forward_auth` in compose, Istio `RequestAuthentication` +
`outputPayloadToHeader` in k8s), which verifies the JWT **once** and injects it as a single
`x-gateway-claims` header. Downstream services (`authmiddleware.RequireMeshClaims()` in Go,
per-language equivalents elsewhere) decode that header and trust it — no JWKS fetch, no
per-request crypto. `claims-gateway` is the only service that ever verifies a raw signature.
`agent-service` is the deliberate exception: it's excluded from the edge JWT gate (it also
serves an HS256 local-dev eval token), so both edges strip any client-supplied
`x-gateway-claims` on `/agent/*` to prevent forgery, and the service falls back to its own
token check in-process.

**Authorization (Cedar)**: fine-grained per-tenant authz is a separate concern from identity,
embedded and evaluated **locally** (no remote PDP) wherever a tenant/role decision actually
arises — today `tenancy-service` (`cedar-go`) and `twin-service` (`cedar-policy` Rust crate,
`include_str!`'d at compile time). One shared policy bundle (`backend/auth-policy`:
`schema.cedarschema`, `policy.cedar`, `fixtures/conformance.json`), three independent
embeddings — a sibling directory each build copies in, not a package import. Role *weights*
are pre-expanded into flat per-tier domain sets (`domainsAsStandardCustomer`,
`domainsAsBusinessAdmin`, …) before Cedar ever runs, because Cedar can compare set membership
(`.contains()`) but not role rank. Watch for `in` vs `.contains()` — Cedar's `in` is
entity-hierarchy membership, not general set membership, and silently denies everything if
used for the latter.

**Go control-plane services** (`claims-gateway`, `tenancy-service`, `registry-service`,
`provisioner`) all follow **Ports & Adapters (Hexagonal)**: a core in `internal/service` (or
`internal/reconciler` for `provisioner`) depends only on interfaces it defines itself
(`store.Store`, `Verifier`, `TenancyClient`, …), wired together in `cmd/<service>/main.go`.
Only the outbound side has a real port/adapter split in this codebase — the inbound side
(`internal/api`) calls the core's concrete struct directly, since there's normally one real
caller. `provisioner`'s driving adapter is a ticker loop, not HTTP.

**Service mesh**: production/staging runs **Istio in ambient mode** (`ztunnel` DaemonSet =
L4 mTLS + workload identity for all traffic, no sidecars; an optional `waypoint` handles L7
only where policy enforcement is needed) — chosen over Linkerd because Linkerd lacks
`RequestAuthentication` and Envoy's `ext_authz`. Trust model is **hard perimeter, guarded
interior**: authentication happens once at the edge, every hop is mTLS-encrypted, but a
workload already inside the mesh can still forge `x-gateway-claims` since mTLS authenticates
the connection, not the payload — accepted for now except for `agent-service`, which is
restricted by workload-identity `AuthorizationPolicy` (`k8s/istio-agent-authz.yml`) since it
runs LLM tool-calling over untrusted input. This must be revisited once a single cluster
serves more than one tenant.

**Routing** (identical table both environments — Caddy locally, Istio Gateway API in k8s):
`/gateway`→claims-gateway, `/tenancy`→tenancy-service, `/twin`→twin-service,
`/sensor`→sensor-service (`/sensor/ingest` ungated — device-facing), `/notification`,
`/chat`, `/agent` (ungated, see above), `/contracts` (own auth, gated separately),
`/socket.io`, `/` catch-all→frontend. `registry-service` and `provisioner` have no external
route by design — control-plane-internal, reached only via HMAC-signed calls
(`internal/api/internalauth.go` in each).

## Golden rules

These preserve boundaries the architecture depends on; a change that violates one won't be
accepted regardless of CI status (full detail:
`documentation/developer/contributing/contributing.qd`).

- **Database-per-service.** Never open a cross-service DB connection. Need data you don't
  own? Read it from the verified token, call the owning service's API, or react to a broker
  event.
- **Stateless services.** No session state in a service; all caller authority travels in the
  signed token/header, so any instance serves any request.
- **One bounded context per service** (see `documentation/developer/domain/strategic-design.qd`).
- **Keep the frontend lightweight.** Avoid adding a global store (Pinia/Vuex) unless
  genuinely necessary; prefer composables and local state.
- **Test what you change**, in the idiomatic location per language (`__tests__/` for
  TypeScript, in-module `#[cfg(test)]` + `tests/` for Rust, `*_test.go` beside the code for
  Go). `just test all` must pass before opening a PR.
- **Route every tool through mise/just** — never rely on ambient `PATH`.
- **Never `git commit` or `git push`, no exception.** User reviews and runs both themselves,
  always. Hook-enforced (`.claude/hooks/block-git-write.sh`, `PreToolUse[Bash]`) — stage/prepare
  changes, then hand off.
- **Docs stay synced with the change that needed them, not after.** Routing/topology,
  service topology, or a new service — update this file (Repository shape / Architecture /
  Commands) and the matching `documentation/developer/*.qd` page in the same change.
  `.claude/hooks/arch-change-reminder.sh` (`PostToolUse[Write|Edit]`) nudges on the files that
  signal this (Caddyfile, docker-compose.yml, `.moon/workspace.yml`, `k8s/*.yml`, a new
  `go.mod`/`Cargo.toml`/`package.json`) — it's a reminder, not a gate, since "was this
  architectural" needs judgment. graphify itself needs no manual step: the git post-commit
  hook re-extracts on every commit.

## Conventions

- **Commits**: Conventional Commits — nothing in CI rejects a malformed message,
  release-please just silently treats it as no-release, so this is enforced by discipline,
  not tooling. Scope = service/area name: `feat(twin): …`, `fix(gateway): …`,
  `chore(ci): …`. Common scopes: `gateway`, `tenancy`, `registry`, `provisioner`, `twin`,
  `sensor`, `notification`, `socket`, `contracts`, `frontend`, `agent`, `ci`, `docs`, `k8s`.
- **Branches**: `<type>/<short-kebab-description>` mirroring the commit type, e.g.
  `feat/private-domains`, `fix/jwt-expiry-off-by-one`.
- **Naming per language** (full tables: `documentation/developer/contributing/naming-conventions.qd`):
  TypeScript services — `camelCase` files/functions, `PascalCase` exported models/interfaces
  (`I`-prefixed interfaces), `UPPER_SNAKE_CASE` constants, plural-lowercase DB collections.
  Vue — `PascalCase` multi-word components, `View`-suffixed page components, `use`-prefixed
  composables. Rust — `snake_case` modules/functions, `PascalCase` types,
  `SCREAMING_SNAKE_CASE` constants. Go — package-matching file names, `PascalCase` exported /
  `camelCase` unexported (capitalization *is* visibility), no `SCREAMING_SNAKE_CASE` constants
  (not idiomatic Go). Standard Go layout: `internal/api`, `internal/service`, `internal/store`
  (+ `storefake` sibling for tests), `internal/events`, `internal/config`.

## Development

- **TDD.** Failing test first, then the implementation, in the service's existing suite
  location (`__tests__/`, in-module `#[cfg(test)]` + `tests/`, `*_test.go`). No behavior
  lands without a test exercising it.
- **Comments only when the why isn't obvious.** Simple code: none. Non-obvious code (a
  workaround, a hidden constraint, a subtle invariant): 1-2 lines, why not what.
- **ponytail is mandatory, plugin-enforced** (`ponytail@ponytail`, user scope, active every
  session via its own hooks — not restated here, same treatment as caveman above): YAGNI,
  stdlib-first, no unrequested abstractions. On-demand: `ponytail-review` after a non-trivial
  change, `ponytail-audit`/`ponytail-debt` to sweep existing code for the same.
- **Use the tools for design/performance questions, don't just reason from memory.** Uncertain
  about an idiomatic pattern, a library's existing solution, or how a change affects the rest
  of the codebase? `graphify query`/`explain` for structure, `/simplify` or `ponytail-review`
  for a complexity/architecture pass, `WebSearch` for language/library idiom — before writing.
- **Less code is better.** Prefer deleting/simplifying over adding. No abstraction, wrapper, or
  config knob the current task doesn't need. Efficiency isn't optional either: if an O(n)-or-worse
  approach has an equivalent O(1)/O(log n) one (map lookup vs. linear scan, index vs.
  re-derive), use the cheaper one — don't default to the naive version because it's easier to
  write.
- **Know your library, don't reinvent it.** Check stdlib and the service's existing
  dependencies (`go.mod`/`Cargo.toml`/`package.json`/`pyproject.toml`) before writing
  something that already exists there.
- **Verification loop for every change**: format (automatic, see hook below) → test (`just
  test <service>`, or the single-test commands above) → lint (`just lint affected`) →
  simplify/review pass (`/simplify` or `ponytail-review`) — before calling it done.

## Token & Performance Optimization

Claude Code only in this repo. Enforcement lives in `.claude/` (hooks + one command), not in
prose here — this section is pointers, not rules to remember.

- **RTK** — every `Bash` call auto-rewritten to its compact-output form.
  Hook: `.claude/settings.json` → `PreToolUse[Bash]` → `rtk hook claude`. Nothing to do;
  `rtk --help` lists what it covers. `.rtk/filters.toml` holds project-local output filters.
- **Caveman** — every response terse (articles/filler/hedging dropped). Enforced by the
  `caveman` plugin itself (its own session hook), not by this file. Code/commits/PRs/security
  always written in full normal prose regardless. `/caveman lite|full|ultra` to change level.
- **Format-on-save** — every `Write`/`Edit` auto-formatted for its language, so style rules
  are enforced by tooling, not memory. Hook: `.claude/settings.json` → `PostToolUse[Write|Edit]`
  → `.claude/hooks/format-on-save.sh` (gofmt / rustfmt / ruff format / prettier, picked by
  file extension, silent no-op if the tool isn't present for that file).
- **Scout** — read-only, no-reasoning lookups (file reads, tree/dir discovery, grep, log
  output) go through `/scout` (`.claude/commands/scout.md`): dispatches `Agent` with
  `subagent_type: "Explore"`, `model: "haiku"`. Not hookable (needs judgment on task type) —
  just do it before reaching for a direct Read/Grep/Bash on an exploration task.
- **Graphify** — usage rules are in the auto-managed `## graphify` section below (owned by
  `graphify claude install`, don't hand-edit it) — including its own `graphify update .`
  instruction after edits, which is the *mid-session* freshness mechanism. The **git**
  post-commit hook (`graphify hook install`) is a second, later safety net (re-extracts on
  every human commit) — it doesn't replace the mid-session update, since this repo blocks me
  from committing myself.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
