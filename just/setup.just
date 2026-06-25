set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

# Bare `just setup` lists recipes.
[private]
default:
    @just --list setup

# Install all dependencies across all languages, in parallel.
install:
    mise install
    mise exec -- node scripts/install.mjs

# Wipe every node_modules + package-lock.json, then reinstall from scratch.
clean-install:
    mise exec -- node scripts/clean.mjs
    just setup install

# Security audit across every project (npm/uv/cargo), mirroring the audit step in
# each per-service CI workflow. cargo-audit is optional (won't fail the run).
audit:
    mise exec -- moon run :audit

# Verify every lockfile is in sync with its manifest (npm ci / uv sync --locked /
# cargo check), mirroring the install step in each per-service CI workflow.
deps-check:
    mise exec -- moon run :deps
