# Bazel Migration Plan

Replace the `just → mise → moon` toolchain stack with **Bazel** (bzlmod) as the single
build/test/dependency coordinator, incrementally and language-by-language, ending with
`mise`, `moon`, and `just` removed entirely. The `scripts/` tree is **kept** — it is
re-homed behind `bazel run`, not deleted.

> Status: Phases 0-2 done (Go, Rust). Phase 3 (Python) done for `agent-service`;
> `simulators/*` and an eval-runner `py_binary` remain (see Phase 3 notes). Phase 4a (Node
> builds, 4 services) done; Phase 4b (`client`) decided but not implemented; Phase 4c (Jest)
> deferred — see Phase 4 notes. Phase 5 (`//tools/cvx`) done. Work it top-to-bottom; each
> phase leaves the repo in a working state.
>
> **CI cutover (Phase 6) is suspended** until a remote cache (bazel-remote or BuildBuddy) is
> provisioned and proven hitting. Without it, `bazel test //...` on ephemeral GH Actions
> runners has nothing to reuse and risks regressing the current per-service job fan-out (see
> §6/§10). Resume Phase 6 planning only once the remote cache exists.

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
- [x] **Phase 3 — Python (`agent-service`).** `bazel build //server/agent-service:app_lib`
      and `bazel test //server/agent-service:unit_test` green on Windows: 146 tests pass,
      exact parity with `uv run pytest tests/unit`. Used `rules_python`'s bzlmod `pip.parse`
      extension against a lock exported from `uv.lock` (`uv export --format requirements-txt
      --no-hashes --no-emit-project -o requirements_lock.txt` — `pip.parse` needs a
      pip-format lock, not `uv.lock` directly; no native rules_python/uv.lock integration
      yet). No native pytest ruleset exists for `rules_python`, so a tiny
      `pytest_runner.py` (`pytest.main(["--asyncio-mode=auto", *sys.argv[1:]])`) stands in
      for `uv run pytest`, hardcoding the one `[tool.pytest.ini_options]` setting that
      matters (`asyncio_mode`) since pytest's config-file discovery doesn't reliably see
      `pyproject.toml` from inside the Bazel sandbox. `integration_test` (Docker/testcontainers
      Postgres) is wired and builds but is `tags = ["manual", "requires-docker"]` and
      unverified here — same precondition class as twin-service's `MONGO_URI` (Phase 2).
      One real finding, and it's a *repeat* of Phase 2's: `app/cedar_authz.py` reads
      `server/auth-policy/{policy.cedar,schema.cedarschema,fixtures/conformance.json}` and
      `server/auth-contracts/roles.json` by relative path — the same three (now four) files
      twin-service's Rust `authz.rs` needed via `include_str!`. `auth-policy`'s
      `exports_files()` only covered the first two; added `fixtures/conformance.json`
      alongside them and wired all four as `data` on `agent-service`'s `app_lib`. Two Python
      services now depend on this cross-language export — worth keeping in mind if
      `auth-policy`/`auth-contracts` are ever split into their own repos (see the "future
      service-per-repo split" note in §1): both files are load-bearing outside their own
      package.
      **Not done**: `simulators/*` (`aq-simulator` isn't a moon-tracked project today — no
      `moon.yml`, not in `.moon/workspace.yml` — so there's no moon-parity target to
      reproduce; `sensor-simulator` is Node/TS, so it belongs to Phase 4, not here) and a
      `py_binary` entrypoint for `evals/run_evals.py` (the eval *tests* — `test_eval_auth.py`,
      `test_eval_status.py` — pass; running the eval suite itself as `bazel run` is
      unstarted, and moon doesn't drive it today either).
- [x] **Phase 4a — TS/Node builds (4 plain services).** `bazel build //server/{chat,notification,sensor,socket}-service:lib`
      green on Windows via Aspect `rules_js` + `rules_ts`, transpile/typecheck parity with
      each service's `npm run build` (`tsc -p tsconfig.build.json`) confirmed by running both
      and diffing — `bazel build //...` (85 targets) is green across the whole repo. Real
      findings, not config mistakes:
      - **`rules_js` doesn't read `package-lock.json` natively.** `npm_translate_lock`'s
        `npm_package_lock` + `update_pnpm_lock` auto-conversion (runs `pnpm import` at
        `MODULE.bazel` resolution time) silently produced an *empty* `pnpm-lock.yaml` on
        Windows — no error, just zero linked packages. Root-caused, not worked around: each
        service's `pnpm-lock.yaml` is instead pre-generated once via `pnpm import` (same
        move as `uv export` for Python in Phase 3) and checked in; `npm_translate_lock` reads
        it directly with `update_pnpm_lock` left at its now-correct default (`False`, since
        neither `npm_package_lock` nor `yarn_lock` is set).
      - **A checked-out `node_modules/` shadows the Bazel-generated one.** Each service
        already had `node_modules/` from local `npm install`. `.bazelignore`'s bare
        `node_modules` line only covers the repo root (confirmed by `client/node_modules`
        already needing its own line) — nested per-service copies silently shadowed the
        `rules_js`-linked `node_modules/<pkg>` targets of the same label, so `ts_project`
        deps resolved to plain source files instead of real linked packages. Fixed by adding
        one `.bazelignore` line per service.
      - **pnpm 10's `onlyBuiltDependencies` gate.** `rules_js` refuses to proceed unless every
        service declares which packages may run install/lifecycle scripts. None of the four
        need any (no native builds are exercised by a pure transpile+typecheck target), so
        each got a `pnpm-workspace.yaml` with `onlyBuiltDependencies: []` (package.json's
        `pnpm` key is a dead config location as of modern pnpm — must be `pnpm-workspace.yaml`).
      - **`ts_project` needs the tsconfig `extends` chain and `rootDir`/`declaration`/
        `sourceMap` made explicit.** Each service's `tsconfig.build.json` extends
        `tsconfig.json`; `ts_config(deps = ["tsconfig.json"])` wires that, and `root_dir`,
        `declaration_map`, `source_map` on `ts_project` have to mirror the tsconfig or its
        validator hard-fails (self-explanatory error, easy fix).
      - **`tsc`'s NodeNext module-type resolution needs `package.json` staged as `data`.**
        Without it, every ESM source file failed with "cannot be written in a CommonJS file"
        — `tsc` walks up from each file's *staged* sandbox location looking for
        `"type": "module"`, and without `data = ["package.json"]` that file isn't present at
        the matching path in the sandbox, so resolution silently defaults to CommonJS.
      - **Local `file:` devDependencies need a real target, not just `exports_files()`.**
        Four services depend on `@crowdvision/eslint-config` via `file:../../tooling/eslint-config`.
        `npm_link_all_packages()` needs a target literally named `pkg` implementing
        `NpmPackageInfo` there for `bazel build //...` to resolve it (building a single
        service's `:lib` target doesn't touch it, since lint isn't wired into `:lib`, but the
        `//...` wildcard sweeps it in regardless) — added via `@aspect_rules_js//npm:defs.bzl`'s
        `npm_package` rule. Lint itself (ESLint) is **not** wired into any Bazel target yet.
      - **Five source-code type annotations, not just build config** (`app: Express`,
        `router: Router` ×2, `redisSubscriber: ReturnType<typeof redisClient.duplicate>`) —
        `rules_js`'s nested pnpm-style `node_modules` store layout means `tsc`'s declaration
        emit (`.d.ts`) can't infer a portable path back to some `@types` packages for a few
        exported values (`TS2883`). This is `tsc`'s own suggested fix, verified to not change
        `npm run build`'s output, but it is real application-code, not just Bazel plumbing —
        worth knowing before assuming Bazel changes never touch `src/`.
- [x] **Phase 4b — `client` (Vite/WebGPU/Vitest/Playwright): decision confirmed, not
      implemented.** Per §7's original recommendation: **wrap, don't port.** Everything
      found while wiring the four plain services (nested store paths breaking declaration
      emit, module-resolution sandbox staging, tsconfig extends chains) would apply to
      `client` too, compounded by Vite's own resolution, `vue-tsc --build`, Vitest, and
      Playwright needing real browser binaries — exactly the effort/gain tradeoff §7
      anticipated. When this is picked up: an opaque wrapper (`native_binary`/`genrule`
      shelling out to `npm ci && npm run build`, `tags = ["manual"]`, no `rules_js` /
      `npm_translate_lock` involvement) rather than porting `client`'s `package.json` scripts
      (`build`: `run-p type-check "build-only {@}"`, i.e. `vue-tsc --build` + `vite build` in
      parallel) into `ts_project`/Vite-native Bazel rules.
- [ ] **Phase 4c — Jest under Bazel: deferred, not attempted beyond investigation.**
      `@aspect_rules_jest`'s `jest_test` needs `jest-cli` (not just `jest`) and `jest-junit`
      linked as direct dependencies, a config *file* (jest config lives inline in
      `package.json#jest` in all four services, not a separate file `jest_test` can consume),
      and per-service ESM vs. CommonJS ts-jest transform variance (`socket-service` uses
      `ts-jest/presets/default-esm` + `--experimental-vm-modules`; the others use the CJS
      transform). On top of that, three of the four (`chat`, `notification`, `sensor`) use
      `mongodb-memory-server`, which downloads and runs a real `mongod` binary at test time —
      a network dependency Bazel's default sandbox blocks, same precondition class as
      twin-service's `MONGO_URI` and agent-service's Docker-based integration tests, except
      here it's the *entire* test suite, not a separable integration subset. Timeboxed rather
      than pushed through; `:lib` (the build/typecheck target) is solid and independently
      useful. Picking this up needs, per service: `jest.config.cjs` extracted from
      `package.json`, `jest-cli`/`jest-junit` added as explicit devDependencies, and a
      decision on `mongodb-memory-server` (pre-fetch the binary into the Bazel sandbox
      cache? `tags = ["manual", "requires-network"]` like twin/agent's DB preconditions?).
- [x] **Phase 5 — Dev orchestration → `//tools/cvx`.** `bazel build //tools/cvx:cvx` and
      `bazel test //tools/cvx:cvx_test` green on Windows. `cvx` is a small stdlib-only Go CLI
      (no cobra/urfave — nothing here needs a framework) with three subcommands, each a thin
      dispatcher to the existing scripts rather than a rewrite: `cvx env` (runs the 8
      `scripts/env/*.js` in sequence), `cvx stack <dev|dev-build|dev-light|start|down|build|integration> [exclude...]`
      (→ `compose-run.mjs`, with `dev-light` resolved to `compose-run.mjs`'s own `dev agent`
      form — same alias `stack.just`'s `dev-light` recipe already used), and `cvx k8s secrets`
      (→ `k8s-secrets.mjs`). Scripts stay on disk untouched, exactly as planned — `cvx` only
      knows how to invoke them.
      Verified without triggering side effects: all argument-validation paths (missing
      subcommand, unknown command, wrong `k8s` subcommand), the `resolveStackArgs` dispatch
      logic under `go_test`, and — the one real end-to-end check — `cvx k8s secrets`, which
      was let run for real. It correctly found `.env`, passed the script's own env-var
      validation, attempted a real `kubectl apply`, and failed only on "no cluster reachable"
      (no k3d cluster running in this session) — proving the full plumbing (`repoRoot()` →
      `exec.Command("node", …)` → real script → real `kubectl`) works, without needing a
      cluster to prove it. Deliberately did **not** run `cvx env` (would regenerate real
      secrets/VAPID keys/JWT tokens into a live `.env`) or `cvx stack dev/start` (spins up
      actual Docker containers) — those need the user's own call, not an unattended one.
      One finding, not a new class but the third instance of it (Phase 4a hit it three times
      for `node_modules`): `.bazelignore`'s bare `.venv` line only covers the repo root, not
      `server/agent-service/.venv` — a real `.venv` populated by Phase 3's `uv run pytest`
      ships vendored `BUILD.bazel`/`.bzl` files inside `temporalio`'s bundled sdk-core proto
      sources, which broke `bazel build //...`'s target-pattern expansion once Gazelle's
      `go.work`-driven walk (added for `tools/cvx`) touched that part of the tree. Fixed with
      one more explicit `.bazelignore` line, same shape as every prior fix of this kind.
      **Not done, and intentionally out of scope for this phase**: rewiring `just`'s
      `stack.just`/`k8s.just`/`agent.just` recipes to call `bazel run //tools/cvx --` instead
      of `mise exec -- node scripts/…`. Per §4's coexistence principle, moon/mise/just stay
      untouched until Phase 7 — `cvx` existing and working is the Phase 5 deliverable: `just`'s
      cutover to it happens alongside removing `mise`/`moon`/`just` themselves, not before.
      `scripts/ops/ingest-docs.js` (used by `just agent ingest`) and `scripts/coverage-summary.py`
      remain un-ported per §5's "case-by-case, defer" call — neither is toolchain-coupled.
- [ ] **Phase 6 — CI cutover. SUSPENDED until a remote cache is provisioned.** Replace
      per-service `tpl-*-ci.yml` + `dorny/paths-filter` with `bazel test //...` gated by
      **affected-target detection** (`target-determinator` or `bazel query rdeps` over the PR
      diff), keeping the existing per-service job fan-out rather than collapsing it into one
      job. `bazel coverage` replaces `tpl-*-coverage`. Retire the
      `setup-{go,rust,node,python}` composite actions (Bazel brings toolchains). Keep
      `setup-mongo` (runtime dep for twin tests). See §6.
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
