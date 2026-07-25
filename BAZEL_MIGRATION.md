# Bazel Migration Plan

Replace the `just → mise → moon` toolchain stack with **Bazel** (bzlmod) as the single
build/test/dependency coordinator, incrementally and language-by-language, ending with
`mise`, `moon`, and `just` removed entirely. The `scripts/` tree is **kept** — it is
re-homed behind `bazel run`, not deleted.

> Status: **planning only**. No Bazel files exist yet. Nothing here is implemented.
> Work it top-to-bottom; each phase leaves the repo in a working state.

---

## 1. Why, in one line

One hermetic, cache-backed coordinator that every language and CI shares — so a clone +
`bazel build //...` reproduces the whole system with no "install four tools first," and a
future service-per-repo split composes through bzlmod. (Full rationale and the rejected
alternatives — Buck2, Pants, Gradle — live in the build-system comparison; this doc is the
"how.")

## 2. What exists today (the three layers coming out)

| Layer | Files | Role |
|-------|-------|------|
| **Tool versions** | `.mise.toml` | Pins `node 24`, `python 3.12`, `rust stable`, `uv`, `moon`, `istioctl 1.30.2`. |
| **Task graph + cache** | `.moon/workspace.yml`, `.moon/toolchain.yml`, `.moon/tasks/{go,rust,typescript,python,javascript}.yml`, 17× `**/moon.yml`, `.moon/cache/` | Defines `build`/`test`/`lint`/`deps`/`audit` per language; caches results; drives `--affected`. |
| **Human entry point** | `Justfile`, `just/{setup,stack,test,db,agent,docs,lint,k8s}.just` | Friendly recipes that shell out via `mise exec -- moon run …` or `mise exec -- node scripts/…`. |

**Per-language task commands moon runs today** (these are exactly what Bazel targets must reproduce):

- **Go**: `go build ./...`, `go test ./...`, `go vet ./...`, `go mod download`
- **Rust**: `cargo build`, `cargo test`, `cargo clippy -- -D warnings`, `cargo check`, `cargo audit`
- **TypeScript**: `npm run build`, `npm test`, `npm run lint`, `npm ci`, `npm audit`
- **Python**: `npm test`/`npm run lint` (delegated), `uv sync --locked`, `uv audit`

**What is NOT part of this migration (stays as-is):**

- `scripts/` — kept; re-invoked via `bazel run` (see Phase 5).
- `docker-compose.yml` + per-service compose files — dev **runtime** orchestration is
  orthogonal to the build graph. `compose-run.mjs` stays; Bazel builds the images it runs.
- `.env` generation (`scripts/env/*`) — dev environment setup, not a build concern.
- `release-please` / `cd-release.yml` — versioning/changelog, unrelated to the coordinator.
- `keycloak/`, `k8s/`, `Caddyfile` — infra config.

## 3. Target Bazel architecture

```
MODULE.bazel            # bzlmod: rules_go, gazelle, rules_rust, rules_python, aspect rules_js/ts, rules_oci
.bazelrc                # common flags, remote cache config, --disk_cache, platform toolchains
.bazelversion          # pinned Bazel version (via bazelisk)
tools/
  cvx/                  # the Go dev-CLI that absorbs the surviving glue (compose, env)  → //tools/cvx
server/<svc>/BUILD.bazel  # per-service targets (Gazelle-generated for Go)
client/BUILD.bazel
...
```

**Rules per language:**

| Language | Ruleset | Dependency source | Notes |
|----------|---------|-------------------|-------|
| Go | `rules_go` + **Gazelle** | `go.mod`/`go.sum` (Gazelle) | Best-supported; Gazelle **auto-generates & maintains `BUILD.bazel`** — the low-maintenance path. Start here. |
| Rust | `rules_rust` + `crate_universe` | `Cargo.toml`/`Cargo.lock` | `crate_universe` reads the existing Cargo lockfiles. The CI `mold` linker flag becomes a per-platform `rustc` flag (Linux only — see §7). |
| Python | `rules_python` | `uv.lock` / `pyproject.toml` | `rules_python` has `uv` support; covers `agent-service`, `simulators`, evals. |
| TS/Node | Aspect `rules_js` + `rules_ts` | `package-lock.json` | Highest effort. The **`client`** (Vite + WebGPU + Vitest + Playwright) is the hard case — see §7. |
| Images | `rules_oci` | — | Builds OCI images directly from the built binaries — **replaces** today's "inject a prebuilt binary into a Dockerfile" hack driven by `.github/services.json`. |

**Target/command shape** (illustrative — not code to add yet):

```
bazel build //server/registry-service          # was: moon run registry-service:build
bazel test  //server/registry-service:test     # was: moon run registry-service:test
bazel build //server/registry-service:image    # OCI image, was: ci-docker + services.json
bazel run   //tools/cvx -- stack dev            # was: just stack dev
```

**The cache win we care about** comes from wiring a remote cache (`bazel-remote` self-hosted,
or BuildBuddy) in `.bazelrc`. This — not the coordinator choice itself — is what cuts rebuild
time; make it an explicit deliverable, not an afterthought.

## 4. Phased migration (incremental, coexisting)

Bazel is added **alongside** moon and only becomes authoritative per-language as each phase
lands. moon/mise/just are not touched until Phase 7.

- [x] **Phase 0 — Bootstrap, no removals.** Add `bazelisk`, `.bazelversion`, `MODULE.bazel`,
      `.bazelrc` (with `--disk_cache` locally + remote cache stanza). Prove `bazel version`
      and an empty build work on Windows and Linux/CI. moon still runs everything.
      Done — proved on Windows directly and on Linux via WSL Ubuntu (native Linux bazelisk,
      not the Windows binary through interop) as part of Phase 1's builds below.
- [x] **Phase 1 — Go (7 services).** `auth-contracts`, `auth-middleware` (note its local
      `replace` of `auth-contracts` — model as a Bazel dep edge), `auth-policy`,
      `claims-gateway`, `provisioner`, `registry-service`, `tenancy-service`. Run Gazelle;
      get `build`/`test`/`vet` green for one service, then all. Add `rules_oci` images for the
      binary-producing ones. **This phase proves the model with the least pain.**
      Done. `bazel build //server/...` and `bazel test //server/...` green on both Windows
      and Linux (WSL). All 4 `rules_oci` images (`claims-gateway`, `provisioner`,
      `registry-service`, `tenancy-service`) build on Linux; **`oci_image` does not build on
      Windows** — genuine open upstream bug (`bazel-contrib/rules_oci` issues #714, #827,
      #53), not a config error on our side; confirmed by building the identical targets
      successfully under WSL. Treat OCI image builds as Linux/CI-only until rules_oci fixes
      Windows support. See §7 for the two other real findings from this phase (multi-module
      `go.work` requirement, `--enable_runfiles` requirement).
- [x] **Phase 2 — Rust (2 services).** `twin-service`, `contracts-service` via
      `crate_universe`. Port `fmt --check` / `clippy -D warnings` / `test` / release build +
      image. Resolve the linker story (§7).
      Done. `bazel build/test //server/twin-service/... //server/contracts-service/...`,
      `--config=rustfmt`, and `--config=clippy` all green on Linux (WSL); `twin-service`'s 5
      Mongo-integration tests need a live `MONGO_URI` (same precondition as CI's
      `needs_mongo: true` — not a Bazel gap). Both `service_image` OCI targets build on Linux,
      on the `cc` distroless variant (not `static` — these link a system TLS backend, matching
      their existing Dockerfiles' `ca-certificates` install). Unlike Go's go.work requirement,
      `crate_universe`'s `from_cargo` supports multiple differently-named tags per module
      directly, so each service's independent Cargo.lock needed no aggregation file. One
      real cross-language finding: `twin-service`'s `authz.rs` pulls `roles.json`/
      `policy.cedar`/`schema.cedarschema` from the Go `auth-contracts`/`auth-policy`
      directories via `include_str!` — Bazel's sandbox needed those files declared as
      `compile_data` (exposed via `exports_files()` in the Go services' BUILD files) since,
      unlike plain `cargo build`, the sandbox doesn't see arbitrary relative-path filesystem
      reads by default. **Both Rust crates fail to build natively on Windows** — confirmed as
      genuine, pre-existing rules_rust/MSVC gaps, not our config, by building the identical
      targets successfully on Linux: `ring` (via reqwest/rustls) fails its cc-rs build step
      under MSVC, and one crate's build script hits an unrelated Windows path bug. Both crates'
      targets are `target_compatible_with`-gated off Windows, so `bazel build/test //...`
      cleanly skips them there instead of failing. Linker story: kept the rules_rust default
      (Windows already matches the repo's existing rust-lld convention; Linux's default is
      "gold," not "mold" — deferred pinning mold to Phase 6, since it requires `mold` actually
      installed on whatever's running the build, same as today's CI `apt-get install mold`
      step, and forcing it now would break any dev machine without it, e.g. this session's
      WSL box).
- [ ] **Phase 3 — Python.** `agent-service`, `simulators/*`, and the evals suite via
      `rules_python` + `uv`. Keep the `pytest` integration + eval-runner entrypoints working.
- [ ] **Phase 4 — TS/Node (5 services + client).** `chat`, `notification`, `sensor`,
      `socket` services first (plain Node/TS). Then decide the **`client`**: full `rules_js`
      Vite build vs. wrapping `npm run build` as an opaque Bazel target (§7). `tooling/eslint-config`
      becomes a shared Bazel dep.
- [ ] **Phase 5 — Dev orchestration → `//tools/cvx`.** Build the Go dev-CLI; move the
      surviving `scripts/` behind it (`compose-run.mjs`, `env/*`, `k8s-secrets.mjs`) as
      `bazel run //tools/cvx -- …` subcommands. Scripts stay on disk; their invocation moves
      off `mise exec -- node`.
- [ ] **Phase 6 — CI cutover.** Replace per-service `tpl-*-ci.yml` + `dorny/paths-filter`
      with `bazel test //...` gated by **affected-target detection** (`target-determinator`
      or `bazel query rdeps` over the PR diff). `bazel coverage` replaces `tpl-*-coverage`.
      Retire the `setup-{go,rust,node,python}` composite actions (Bazel brings toolchains).
      Keep `setup-mongo` (runtime dep for twin tests). See §6.
- [ ] **Phase 7 — Remove `just`/`mise`/`moon`.** Only once every service builds+tests under
      Bazel and CI is green on Bazel. Deletion checklist in §8.

## 5. Scripts — kept, re-homed (not deleted)

Per decision, `scripts/` survives the migration. Its role changes:

| Script(s) | Under Bazel |
|-----------|-------------|
| `scripts/env/*`, `scripts/compose/compose-run.mjs`, `scripts/k8s/k8s-secrets.mjs` | Survive as dev-env/runtime glue → invoked via `//tools/cvx` (`bazel run`). |
| `scripts/install.mjs`, `scripts/clean.mjs`, `scripts/lib/{mise,run,workspaces}.mjs` | Become **obsolete** — Bazel fetches deps hermetically and parallelizes itself. Remove in Phase 7, not before. |
| `scripts/coverage-summary.py`, `scripts/ops/ingest-docs.js` | Case-by-case; not toolchain-coupled, defer. |

(A later, separate effort can port the surviving `.mjs`/`.js` glue to Go inside `//tools/cvx`
to also drop the Node-for-scripting dependency and the `.js`/`.mjs` inconsistency — tracked
independently of this migration.)

## 6. CI surface to touch

CI runs raw toolchain commands today, **not** moon — so this is real work, not a find/replace.

- **Rewrite:** `ci-gate.yml` (change detection → affected Bazel targets),
  `tpl-{go,rust,node,python}-ci.yml`, `tpl-*-coverage.yml`, `ci-client.yml`, `ci-docker.yml`
  (→ `rules_oci`), `ci-infra.yml`, `ci-simulators.yml`.
- **Retire once green:** `.github/actions/setup-{go,rust,node,python}` (Bazel supplies
  toolchains). **Keep** `.github/actions/setup-mongo` (runtime service for twin tests).
- **Verify:** whether the composite `setup-*` actions read `.mise.toml` — if so they must be
  updated/removed together with it.
- **Revisit:** `.github/services.json` — the image registry that feeds `ci-docker.yml` and
  `cd-registry.yml`; `rules_oci` may subsume its build role (metadata for `cd-*` may still be
  useful).
- **Leave alone:** `cd-release.yml`/release-please, `ci-codeql.yml`, `ci-dependency-review.yml`,
  `maint-*`, `cd-documentation.yml` (unless the docs build itself moves into Bazel).

## 7. Risks & Windows caveats (your primary dev box)

- **Frontend (`client`) is the hard part.** Vite + WebGPU + Vitest + Playwright under
  `rules_js` is a large effort for little build-time gain. **Recommended:** wrap `npm run build`
  as an opaque Bazel target (or leave `client` on npm) rather than fully Bazel-native it.
  Don't let it block the backend migration.
- **Rust linker.** CI currently forces `mold` (`RUSTFLAGS=-C link-arg=-fuse-ld=mold`, Linux
  only). Under `rules_rust` this becomes a per-platform toolchain flag; on Windows keep the
  default/`rust-lld` (matches the existing `build-speed-strategy` note). mold is not available
  on Windows — do not carry the flag across platforms. **Resolution (Phase 2):** left on
  rules_rust's default toolchain rather than pinning mold — the Linux default ("gold," with a
  deprecation warning but a working build) doesn't require anything extra installed, whereas
  mold does (this session's own WSL box didn't have it). Pin it later as a `--config=ci` flag
  in Phase 6, alongside actually installing mold on the CI runner (mirroring today's
  `apt-get install mold` in `.github/actions/setup-rust`) — don't force an environment
  dependency onto every dev box for a speed optimization.
- **Bazel on Windows is second-class.** It works, but sandboxing is weaker and some rules have
  rough edges. Budget for Windows-specific `.bazelrc` platform config and test every phase on
  Windows *and* Linux before moving on. Two concrete Phase 1 findings, now handled:
  - Windows disables runfiles symlinks by default, which silently breaks any test reading a
    data file by relative path (not `go:embed`) — needs `build:windows --enable_runfiles` in
    `.bazelrc` (already added). Caught by `auth-contracts`/`auth-policy`'s fixture-reading
    tests failing with "file not found" until this was set.
  - `rules_oci`'s `oci_image` does not build on native Windows at all (see Phase 1 note above)
    — a real upstream gap, not something to route around per-repo. Build/verify OCI images on
    Linux or CI; don't block on a Windows fix landing upstream.
  - A monorepo with multiple independent `go.mod` files needs a `go.work` (kept in sync under
    `server/*`) because Gazelle's `go_deps` extension accepts only one `from_file` tag per
    Bazel module. Verified this doesn't change plain `go build`/`go test` behavior that moon
    still relies on.
  - Three more Phase 2 findings, now handled:
    - `crate_universe`'s dependency splicing needs Windows Developer Mode enabled (unprivileged
      symlink creation — `SeCreateSymbolicLinkPrivilege`). Standard, officially-documented
      Bazel-on-Windows prerequisite, not fixable per-repo; enabled once for this dev box.
    - `ring` (pulled in transitively by both Rust services via reqwest/rustls) fails its cc-rs
      native build under Bazel + MSVC on Windows (`ring_core_generated/prefix_symbols.h` not
      found); a second, unrelated crate hits a separate Windows-only `cargo_build_script` path
      bug. Both are open, pre-existing rules_rust/Windows gaps — confirmed by building the
      identical targets successfully on Linux via WSL. Both Rust crates' targets are
      `target_compatible_with`-gated off `@platforms//os:windows`, so `bazel build/test //...`
      cleanly *skips* them on Windows instead of failing outright — same treatment as the Go
      phase's `oci_image` targets, but via the more precise "genuinely incompatible" mechanism
      rather than `manual`.
    - Cross-language compile-time file sharing needs explicit Bazel wiring: `twin-service`'s
      Rust `authz.rs` reads `roles.json`/`policy.cedar`/`schema.cedarschema` from the Go
      `auth-contracts`/`auth-policy` packages via `include_str!`. Bazel's sandbox doesn't see
      arbitrary relative-path filesystem reads the way plain `cargo build` does — fixed via
      `exports_files()` in those Go packages' `BUILD.bazel` plus `compile_data` on the Rust
      targets.
- **Editor/LSP integration** is `mise`'s quiet remaining job (tool versions for `gopls`,
  `rust-analyzer`). After removing `mise`, point editors at Bazel-provided toolchains
  (`rules_rust` ships a `rust-analyzer` aspect; Gazelle/`bazel-go` for gopls). Confirm this
  works before Phase 7 or DX regresses.
- **`istioctl 1.30.2`** is pinned in `.mise.toml` but is a k8s CLI, not a build input. Give it
  a new home (documented install, or a `bazel run` wrapper) when `.mise.toml` goes.
- **Coexistence drift.** While both systems exist (Phases 1–6), a service could pass under moon
  but not Bazel or vice-versa. Make Bazel the CI gate for a language *the same PR* it lands, so
  the two don't silently diverge.

## 8. Removal checklist (Phase 7 only)

- [ ] Delete `.mise.toml`
- [ ] Delete `.moon/` (workspace.yml, toolchain.yml, tasks/*, cache/) and all 17 `**/moon.yml`
- [ ] Delete `Justfile` and `just/*.just`
- [ ] Delete obsolete scripts: `scripts/install.mjs`, `scripts/clean.mjs`, `scripts/lib/{mise,run,workspaces}.mjs`
- [ ] Remove `moon`/`mise` from any remaining CI/composite actions
- [ ] Docs sweep (§9)

## 9. Documentation to update

Toolchain-documenting `.qd` guides that carry actual `just`/`moon`/`mise` commands
(confirmed command-bearing):

- `documentation/developer/config/toolchain.qd`
- `documentation/developer/config/setting-up.qd`
- `documentation/developer/config/running.qd`
- `documentation/developer/config/docker-compose.qd`
- `documentation/developer/contributing/contributing.qd`
- `documentation/developer/contributing/cicd.qd`

Plus root `README.md`, `CLAUDE.md` (the *Commands* section and the layout table), and
`server/{chat-service,agent-service}/README.md`.

> A broader grep matched the terms in ~34 `.qd` files, but most are the English word "just".
> Before the docs sweep, grep specifically for `mise exec`, `moon run`, and `just <group>`
> command forms to separate real command references from prose. Follow the repo rule: state
> the new Bazel behavior as fact; do not narrate the migration away from moon in the guides.

## 10. Definition of done

- [ ] `bazel build //...` and `bazel test //...` green on Windows and Linux/CI.
- [ ] Every service's build/test/lint/image reproduced as Bazel targets.
- [ ] Remote cache wired and demonstrably hitting.
- [ ] CI gates on affected Bazel targets; old templates + toolchain setup actions removed.
- [ ] `.mise.toml`, `.moon/`, `Justfile`, `just/` deleted; kept scripts run via `bazel run`.
- [ ] Docs and `CLAUDE.md` reflect Bazel commands.
