# Cross-platform task runner (bash on Unix / PowerShell on Windows)
set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

# ── Installation ──────────────────────────────────────────────────────────────

# Install all dependencies across all languages
install:
    npm install
    uv sync --project server/agent-service
    cargo fetch --manifest-path server/contracts-service/Cargo.toml

# ── Environment ───────────────────────────────────────────────────────────────

# Generate .env (VAPID keys, JWT tokens, admin credentials)
env:
    npm run env:setup

# ── Development ───────────────────────────────────────────────────────────────

# Start dev stack with hot-reload. Exclude services by substring of folder name:
#   just dev exclude="agent"            → skip agent-service, agent-db, agent-ingester
#   just dev exclude="agent simulator"  → also skip aq-simulator, sensor-simulator
[doc("Start dev stack. Use exclude= with space-separated substrings of folder names.")]
dev exclude="":
    npm run env:setup
    node scripts/compose-run.mjs dev {{exclude}}

# Start production stack in background. Same exclusion syntax as `dev`.
[doc("Start production stack (background). Use exclude= with space-separated substrings.")]
start exclude="":
    npm run env:setup
    node scripts/compose-run.mjs start {{exclude}}

# Stop all containers and remove orphans (always tears down everything)
down:
    node scripts/compose-run.mjs down

# Follow logs for all services, or one: just logs auth-service
logs service="":
    docker compose -f docker-compose.yml logs -f {{service}}

# ── Testing ───────────────────────────────────────────────────────────────────

# Run all unit tests across all services
test:
    npm run test

# Run agent Python unit tests only
test-agent:
    uv run --directory server/agent-service pytest tests/unit

# Run backend integration tests against a composed stack (full stack, no exclusion)
test-integration:
    node scripts/compose-run.mjs integration
    node scripts/compose-run.mjs down

# ── Database Utilities ────────────────────────────────────────────────────────

# Clear all service databases (auth, twin, notification, agent)
db-clear:
    docker compose -f docker-compose.yml -f server/auth-service/docker-compose.yml exec auth-db mongosh authdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/twin-service/docker-compose.yml exec twin-db mongosh twindb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/notification-service/docker-compose.yml exec notification-db mongosh notificationdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/agent-service/docker-compose.yml exec agent-db psql -U agent -d agentdb -c "TRUNCATE chunks, documents RESTART IDENTITY CASCADE;"

# Clear sensor database only
db-clear-sensor:
    docker compose -f docker-compose.yml -f server/sensor-service/docker-compose.yml exec sensor-db mongosh sensordb --eval "db.dropDatabase()"

# ── Agent Knowledge Base ──────────────────────────────────────────────────────

# Re-ingest all documentation into the agent knowledge base
agent-ingest:
    node scripts/ingest-docs.js

# ── Linting ───────────────────────────────────────────────────────────────────

# Lint all workspaces
lint:
    npm run lint

# Fix linting issues across all workspaces
lint-fix:
    npm run lint:fix

# ── Kubernetes ────────────────────────────────────────────────────────────────

# Build all Docker images for Kubernetes registry
k8s-build:
    npm run k8s:build

# Deploy full Kubernetes stack
k8s-deploy:
    npm run k8s:deploy
