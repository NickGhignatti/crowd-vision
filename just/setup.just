set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list setup

[doc("Install all dependencies across all languages, in parallel.")]
install:
    mise install
    mise exec -- node scripts/install.mjs

[doc("Wipe every node_modules + package-lock.json, then reinstall from scratch.")]
clean-install:
    mise exec -- node scripts/clean.mjs
    just setup install

[doc("Security audit across every project (npm/uv/cargo), mirroring per-service CI.")]
audit:
    mise exec -- moon run :audit

# npm ci / uv sync --locked / cargo check.
[doc("Verify every lockfile is in sync with its manifest, mirroring per-service CI.")]
deps-check:
    mise exec -- moon run :deps
