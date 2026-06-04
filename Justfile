# Cross-platform task runner (bash on Unix / PowerShell on Windows)
set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

# ── Installation ──────────────────────────────────────────────────────────────

# Install all dependencies across all languages, in parallel.
# Requires mise (https://mise.jdx.dev/) for tool version management:
#   mise install          → installs Node 24, Python 3.12, Rust stable, moon
#   npm install -g @moonrepo/cli   → alternative if mise is not available
#
# Uses `npm ci` (reproducible, never rewrites a lockfile) so installing on
# Windows/macOS can't strip the Linux optional packages from the locks — see
# `clean-install` below for regenerating them. Override parallelism with JOBS=N.
install:
    node scripts/install.mjs

# Wipe every node_modules + package-lock.json, then reinstall from scratch.
# Cross-platform: safe to run on Windows, macOS, or Linux.
#
# Lock files are regenerated with --cpu=x64 --os=linux so that
# platform-specific optional packages (e.g. @emnapi/* pulled in by
# mongodb-memory-server) are resolved for Linux — matching the CI runner —
# even when running locally on Windows or macOS.
clean-install:
    node scripts/clean.mjs
    npm --prefix tooling install --package-lock-only --cpu=x64 --os=linux
    npm --prefix tooling/eslint-config install --package-lock-only --cpu=x64 --os=linux
    npm --prefix client install --package-lock-only --cpu=x64 --os=linux
    npm --prefix server/auth-service install --package-lock-only --cpu=x64 --os=linux
    npm --prefix server/twin-service install --package-lock-only --cpu=x64 --os=linux
    npm --prefix server/notification-service install --package-lock-only --cpu=x64 --os=linux
    npm --prefix server/sensor-service install --package-lock-only --cpu=x64 --os=linux
    npm --prefix server/socket-service install --package-lock-only --cpu=x64 --os=linux
    npm --prefix server/tests install --package-lock-only --cpu=x64 --os=linux
    npm --prefix simulators/sensor-simulator install --package-lock-only --cpu=x64 --os=linux
    uv lock --project server/agent-service
    just install

# ── Dependency Verification ───────────────────────────────────────────────────

# Mirror CI's security audit locally (npm audit + uv audit + cargo audit), in
# parallel. Run before pushing to catch vulnerabilities the `ci-audit` gate would.
# cargo-audit is optional — skipped with a hint if not installed.
audit:
    node scripts/audit.mjs

# Mirror CI's dependency check locally (npm ci + uv sync --locked + cargo check),
# in parallel. Verifies every lockfile is in sync with its manifest, matching the
# `ci-deps` gate. Override parallelism with JOBS=N.
deps-check:
    node scripts/deps-check.mjs

# ── Environment ───────────────────────────────────────────────────────────────

# Generate .env (VAPID keys, JWT tokens, admin credentials)
env:
    node scripts/env/create.js
    node scripts/env/vapid.js
    node scripts/env/token.js
    node scripts/env/config.js
    node scripts/env/admin.js

# ── Development ───────────────────────────────────────────────────────────────

# Start dev stack with hot-reload. Exclude services by substring of folder name:
#   just dev exclude="agent"            → skip agent-service, agent-db, agent-ingester
#   just dev exclude="agent simulator"  → also skip aq-simulator, sensor-simulator
[doc("Start dev stack. Use exclude= with space-separated substrings of folder names.")]
dev exclude="": env
    node scripts/compose/compose-run.mjs dev {{exclude}}

# Start production stack in background. Same exclusion syntax as `dev`.
[doc("Start production stack (background). Use exclude= with space-separated substrings.")]
start exclude="": env
    node scripts/compose/compose-run.mjs start {{exclude}}

# Stop all containers and remove orphans (always tears down everything)
down:
    node scripts/compose/compose-run.mjs down

# Follow logs for all services, or one: just logs auth-service
logs service="":
    docker compose -f compose.runtime.yml logs -f {{service}}

# ── Testing ───────────────────────────────────────────────────────────────────

# Run all unit tests across all services (moon handles caching + task graph)
test:
    moon run :test

# Run only tests for services affected by changes on the current branch
test-affected:
    moon run :test --affected

# Per-service unit tests
test-auth:
    moon run auth-service:test

test-twin:
    moon run twin-service:test

test-notification:
    moon run notification-service:test

test-sensor:
    moon run sensor-service:test

test-socket:
    moon run socket-service:test

test-client:
    moon run client:test

test-agent:
    moon run agent-service:test

# Agent Python integration tests (separate suite from the docker-compose one)
test-agent-integration:
    uv run --directory server/agent-service pytest tests/integration

# Run backend integration tests against a composed stack (full stack, no exclusion)
test-integration:
    node scripts/compose/compose-run.mjs integration
    node scripts/compose/compose-run.mjs down

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
    node scripts/ops/ingest-docs.js

# ── Linting ───────────────────────────────────────────────────────────────────

# Lint every service (moon caches results; unchanged services are instant)
lint:
    moon run :lint

# Lint only services affected by changes on the current branch
lint-affected:
    moon run :lint --affected

# Fix linting issues across every service (always runs; not cached)
lint-fix:
    moon run :lint-fix

# ── Kubernetes ────────────────────────────────────────────────────────────────

# Print the line to add to your hosts file for local k3d access
# Windows: C:\Windows\System32\drivers\etc\hosts  (open as Administrator)
# Linux / Mac: /etc/hosts
k8s-hosts:
    @echo "Add this to your hosts file:"
    @echo "  127.0.0.1   crowdvision.local"

# Stop the cluster (pause all containers, data is preserved).
k8s-stop:
    k3d cluster stop crowdvision

# Resume a stopped cluster. Port bindings are preserved so the existing kubeconfig patch stays valid.
# If kubectl fails after restart, re-run: kubectl config set-cluster k3d-crowdvision --server=https://127.0.0.1:<PORT>
# (find PORT with: docker ps --filter name=k3d-crowdvision-serverlb)
k8s-start:
    k3d cluster start crowdvision

# Install the NGINX Ingress Controller into the cluster (run once per cluster)
k8s-ingress:
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/cloud/deploy.yaml
    kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s

# Create or update all Kubernetes secrets from your .env file
k8s-secrets:
    node scripts/k8s/k8s-secrets.mjs

# Validate all manifests without touching the cluster (dry run)
k8s-validate:
    kubectl apply --dry-run=client -f k8s/namespace.yml
    kubectl apply --dry-run=client -f k8s/configmaps/
    kubectl apply --dry-run=client -f k8s/stateful/
    kubectl apply --dry-run=client -f k8s/deployments/
    kubectl apply --dry-run=client -f k8s/ingress.yml
    kubectl apply --dry-run=client -f k8s/monitoring/

# Apply all manifests in dependency order — safe to run multiple times (idempotent)
k8s-apply:
    kubectl apply -f k8s/namespace.yml
    kubectl apply -f k8s/configmaps/
    kubectl apply -f k8s/stateful/
    kubectl apply -f k8s/deployments/
    kubectl apply -f k8s/ingress.yml
    kubectl apply -f k8s/monitoring/

# Full first-time cluster setup: ingress controller → namespace → secrets → all manifests
k8s-setup: k8s-ingress
    kubectl apply -f k8s/namespace.yml
    just k8s-secrets
    just k8s-apply

# Build all Docker images locally, tagged for GHCR
k8s-build:
    docker build -t ghcr.io/nickghignatti/crowdvision-client:latest ./client
    docker build -t ghcr.io/nickghignatti/crowdvision-auth:latest ./server/auth-service
    docker build -t ghcr.io/nickghignatti/crowdvision-twin:latest ./server/twin-service
    docker build -t ghcr.io/nickghignatti/crowdvision-notification:latest ./server/notification-service
    docker build -t ghcr.io/nickghignatti/crowdvision-sensor:latest ./server/sensor-service
    docker build -t ghcr.io/nickghignatti/crowdvision-socket:latest ./server/socket-service
    docker build -t ghcr.io/nickghignatti/crowdvision-agent:latest ./server/agent-service
    docker build -t ghcr.io/nickghignatti/crowdvision-contracts:latest ./server/contracts-service

# Push all built images to GHCR (requires: docker login ghcr.io first)
k8s-push:
    docker push ghcr.io/nickghignatti/crowdvision-client:latest
    docker push ghcr.io/nickghignatti/crowdvision-auth:latest
    docker push ghcr.io/nickghignatti/crowdvision-twin:latest
    docker push ghcr.io/nickghignatti/crowdvision-notification:latest
    docker push ghcr.io/nickghignatti/crowdvision-sensor:latest
    docker push ghcr.io/nickghignatti/crowdvision-socket:latest
    docker push ghcr.io/nickghignatti/crowdvision-agent:latest
    docker push ghcr.io/nickghignatti/crowdvision-contracts:latest

# Build and push in one step (for VPS production deployments)
k8s-build-push: k8s-build k8s-push

# Load locally built images directly into k3d (local dev — skips GHCR entirely)
# Requires k3d. Pass cluster= to target a different cluster name: just k8s-load cluster=mycluster
k8s-load cluster="crowdvision":
    k3d image import ghcr.io/nickghignatti/crowdvision-client:latest ghcr.io/nickghignatti/crowdvision-auth:latest ghcr.io/nickghignatti/crowdvision-twin:latest ghcr.io/nickghignatti/crowdvision-notification:latest ghcr.io/nickghignatti/crowdvision-sensor:latest ghcr.io/nickghignatti/crowdvision-socket:latest ghcr.io/nickghignatti/crowdvision-agent:latest ghcr.io/nickghignatti/crowdvision-contracts:latest -c {{cluster}}

# Show all pods, deployments, services and StatefulSets in the namespace
k8s-status:
    kubectl get all -n crowdvision

# Follow live logs for a service: just k8s-logs auth-service
# Works for both Deployments and StatefulSets (uses label selector app=<service>)
k8s-logs service:
    kubectl logs -n crowdvision -l app={{service}} --tail=100 -f --max-log-requests=10

# Trigger a rolling restart for one service — picks up a new :latest image
# New pods start and become ready before old pods are terminated (zero downtime)
k8s-restart service:
    kubectl rollout restart deployment/{{service}} -n crowdvision

# Restart all deployments at once (e.g. after rotating secrets)
k8s-restart-all:
    kubectl rollout restart deployment -n crowdvision

# Watch a rolling update until completion: just k8s-rollout auth-service
k8s-rollout service:
    kubectl rollout status deployment/{{service}} -n crowdvision

# Permanently deletes the namespace and ALL data inside it.
# Database PVCs are also deleted. There is no undo.
k8s-delete:
    kubectl delete namespace crowdvision
