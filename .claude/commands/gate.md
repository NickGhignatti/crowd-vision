---
description: Run the local checks that mirror ci-gate, in CI order, stopping at the first failure.
argument-hint: [affected|all]  (default: affected)
---

Scope: `$ARGUMENTS` — `all` runs the full suite, anything else (or empty) runs only what the
branch touched.

CI is one job per service (`.github/workflows/ci-gate.yml` fans out to `tpl-rust-ci.yml`,
`tpl-go-ci.yml`, `tpl-python-ci.yml`, `tpl-node-ci.yml`, `ci-frontend.yml`), and the single
required check is `ci-gate / ci-passed`. Each Rust job runs, in order: `cargo fmt --check` →
`clippy --release --all-targets -- -D warnings` → `cargo audit` → unit tests → **integration
tests against real Mongo/Redis/Timescale/Kafka** → release build.

Run locally, stopping at the first failure:

1. `just lint <scope>` — clippy `-D warnings`, `go vet`, ruff, eslint
2. `just test <scope>` — the unit legs
3. `just setup deps-check` — lockfile sync (`npm ci` / `uv sync --locked` / `cargo check`)
4. `just setup audit` — `npm` / `uv` / `cargo audit`

Then, **when the change touches persistence, Kafka or Redis** — CI will run these whether or
not you do:

5. `just test <svc>-integration` for each affected Rust service, or `just test integration`
   for the cross-service acceptance suite.

Rules:

- Report the **shortest decisive line** of a failure, not the whole log.
- `just lint fix` formats; CI fails on `cargo fmt --check`, so never hand-format Rust.
- A lockfile failure in step 3 usually means a Node dep was installed without regenerating the
  Linux lockfile: `just setup clean-install`, or
  `npm install --prefix <dir> --package-lock-only --cpu=x64 --os=linux`.
- Never `git commit` or `git push` at the end. Report status and stop.
