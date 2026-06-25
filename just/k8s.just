set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

# Bare `just k8s` lists recipes.
[private]
default:
    @just --list k8s

# Print the line to add to your hosts file for local k3d access
# Windows: C:\Windows\System32\drivers\etc\hosts  (open as Administrator)
# Linux / Mac: /etc/hosts
hosts:
    @echo "Add this to your hosts file:"
    @echo "  127.0.0.1   crowdvision.local"

# Stop the cluster (pause all containers, data is preserved).
stop:
    k3d cluster stop crowdvision

# Resume a stopped cluster. Port bindings are preserved so the existing kubeconfig patch stays valid.
# If kubectl fails after restart, re-run: kubectl config set-cluster k3d-crowdvision --server=https://127.0.0.1:<PORT>
# (find PORT with: docker ps --filter name=k3d-crowdvision-serverlb)
start:
    k3d cluster start crowdvision

# Install the NGINX Ingress Controller into the cluster (run once per cluster)
ingress:
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.0/deploy/static/provider/cloud/deploy.yaml
    kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=120s

# Create or update all Kubernetes secrets from your .env file
secrets:
    mise exec -- node scripts/k8s/k8s-secrets.mjs

# Validate all manifests without touching the cluster (dry run)
validate:
    kubectl apply --dry-run=client -f k8s/namespace.yml
    kubectl apply --dry-run=client -f k8s/configmaps/
    kubectl apply --dry-run=client -f k8s/stateful/
    kubectl apply --dry-run=client -f k8s/deployments/
    kubectl apply --dry-run=client -f k8s/ingress.yml
    kubectl apply --dry-run=client -f k8s/monitoring/

# Apply all manifests in dependency order — safe to run multiple times (idempotent)
apply:
    kubectl apply -f k8s/namespace.yml
    kubectl apply -f k8s/configmaps/
    kubectl apply -f k8s/stateful/
    kubectl apply -f k8s/deployments/
    kubectl apply -f k8s/ingress.yml
    kubectl apply -f k8s/monitoring/

# Full first-time cluster setup: ingress controller → namespace → secrets → all manifests
setup: ingress
    kubectl apply -f k8s/namespace.yml
    just k8s secrets
    just k8s apply

# Build all Docker images locally, tagged for GHCR
build:
    docker build -t ghcr.io/nickghignatti/crowdvision-client:latest ./client
    docker build -t ghcr.io/nickghignatti/crowdvision-auth:latest ./server/auth-service
    docker build -t ghcr.io/nickghignatti/crowdvision-chat:latest ./server/chat-service
    docker build -t ghcr.io/nickghignatti/crowdvision-twin:latest ./server/twin-service
    docker build -t ghcr.io/nickghignatti/crowdvision-notification:latest ./server/notification-service
    docker build -t ghcr.io/nickghignatti/crowdvision-sensor:latest ./server/sensor-service
    docker build -t ghcr.io/nickghignatti/crowdvision-socket:latest ./server/socket-service
    docker build -t ghcr.io/nickghignatti/crowdvision-agent:latest ./server/agent-service
    docker build -t ghcr.io/nickghignatti/crowdvision-contracts:latest ./server/contracts-service

# Push all built images to GHCR (requires: docker login ghcr.io first)
push:
    docker push ghcr.io/nickghignatti/crowdvision-client:latest
    docker push ghcr.io/nickghignatti/crowdvision-auth:latest
    docker push ghcr.io/nickghignatti/crowdvision-chat:latest
    docker push ghcr.io/nickghignatti/crowdvision-twin:latest
    docker push ghcr.io/nickghignatti/crowdvision-notification:latest
    docker push ghcr.io/nickghignatti/crowdvision-sensor:latest
    docker push ghcr.io/nickghignatti/crowdvision-socket:latest
    docker push ghcr.io/nickghignatti/crowdvision-agent:latest
    docker push ghcr.io/nickghignatti/crowdvision-contracts:latest

# Build and push in one step (for VPS production deployments)
build-push: build push

# Load locally built images directly into k3d (local dev — skips GHCR entirely)
# Requires k3d. Pass cluster= to target a different cluster name: just k8s load cluster=mycluster
load cluster="crowdvision":
    k3d image import ghcr.io/nickghignatti/crowdvision-client:latest ghcr.io/nickghignatti/crowdvision-auth:latest ghcr.io/nickghignatti/crowdvision-chat:latest ghcr.io/nickghignatti/crowdvision-twin:latest ghcr.io/nickghignatti/crowdvision-notification:latest ghcr.io/nickghignatti/crowdvision-sensor:latest ghcr.io/nickghignatti/crowdvision-socket:latest ghcr.io/nickghignatti/crowdvision-agent:latest ghcr.io/nickghignatti/crowdvision-contracts:latest -c {{cluster}}

# Show all pods, deployments, services and StatefulSets in the namespace
status:
    kubectl get all -n crowdvision

# Follow live logs for a service: just k8s logs auth-service
# Works for both Deployments and StatefulSets (uses label selector app=<service>)
logs service:
    kubectl logs -n crowdvision -l app={{service}} --tail=100 -f --max-log-requests=10

# Trigger a rolling restart for one service — picks up a new :latest image
# New pods start and become ready before old pods are terminated (zero downtime)
restart service:
    kubectl rollout restart deployment/{{service}} -n crowdvision

# Restart all deployments at once (e.g. after rotating secrets)
restart-all:
    kubectl rollout restart deployment -n crowdvision

# Watch a rolling update until completion: just k8s rollout auth-service
rollout service:
    kubectl rollout status deployment/{{service}} -n crowdvision

# Permanently deletes the namespace and ALL data inside it.
# Database PVCs are also deleted. There is no undo.
delete:
    kubectl delete namespace crowdvision
