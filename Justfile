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
    node scripts/compose/compose-run.mjs dev {{exclude}}

# Start production stack in background. Same exclusion syntax as `dev`.
[doc("Start production stack (background). Use exclude= with space-separated substrings.")]
start exclude="":
    npm run env:setup
    node scripts/compose/compose-run.mjs start {{exclude}}

# Stop all containers and remove orphans (always tears down everything)
down:
    node scripts/compose/compose-run.mjs down

# Follow logs for all services, or one: just logs auth-service
logs service="":
    docker compose -f docker-compose.yml logs -f {{service}}

# ── Testing ───────────────────────────────────────────────────────────────────

# Run all unit tests across all services (sequential)
test:
    node scripts/test/test-run.mjs all

# Run all unit tests in parallel (faster, but interleaved-looking output is buffered per suite)
test-all-parallel:
    node scripts/test/test-run.mjs all --parallel

# Per-service unit tests
test-auth:
    node scripts/test/test-run.mjs auth

test-twin:
    node scripts/test/test-run.mjs twin

test-notification:
    node scripts/test/test-run.mjs notification

test-sensor:
    node scripts/test/test-run.mjs sensor

test-socket:
    node scripts/test/test-run.mjs socket

test-client:
    node scripts/test/test-run.mjs client

test-agent:
    node scripts/test/test-run.mjs agent

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

# Lint all workspaces
lint:
    npm run lint

# Fix linting issues across all workspaces
lint-fix:
    npm run lint:fix

# ── Kubernetes ────────────────────────────────────────────────────────────────

# Print the line to add to your hosts file for local k3d access
# Windows: C:\Windows\System32\drivers\etc\hosts  (open as Administrator)
# Linux / Mac: /etc/hosts
k8s-hosts:
    @echo "Add this to your hosts file:"
    @echo "  127.0.0.1   crowdvision.local"

# Stop the cluster (pause all containers, data is preserved). Resume with k8s-start.
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

# ── Image management ──────────────────────────────────────────────────────────

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

# ── Day-to-day operations ─────────────────────────────────────────────────────

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
