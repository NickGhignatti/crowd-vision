set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list k8s

# Windows: C:\Windows\System32\drivers\etc\hosts
# Linux / Mac: /etc/hosts
[doc("Print the line to add to your hosts file for local k3d access.")]
hosts:
    @echo "Add this to your hosts file:"
    @echo "  127.0.0.1   ambitwin.local"

[doc("Stop the cluster (pause all containers, data is preserved).")]
stop:
    k3d cluster stop ambitwin

[doc("Resume a stopped cluster (port bindings preserved).")]
start:
    k3d cluster start ambitwin

[doc("Create a fresh k3d cluster named ambitwin (run once).")]
create:
    k3d cluster create ambitwin -p "80:80@loadbalancer" -p "443:443@loadbalancer" --api-port 6550 --k3s-arg "--disable=traefik@server:0" --wait --timeout 120s

[doc("Install the Gateway API CRDs (required for the ingress Gateway/HTTPRoute).")]
gateway-api:
    kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

[doc("Install Istio in ambient mode with k3d-correct CNI paths (run once per cluster).")]
istio-install:
    mise exec -- istioctl install --set profile=ambient --set values.cni.cniConfDir=/var/lib/rancher/k3s/agent/etc/cni/net.d --set values.cni.cniBinDir=/bin -y

[doc("Create or update all Kubernetes secrets from your .env file.")]
secrets:
    mise exec -- sh scripts/k8s/k8s-secrets.sh

[doc("Validate all manifests without touching the cluster (dry run).")]
validate:
    kubectl apply --dry-run=client -f k8s/namespace.yml
    kubectl apply --dry-run=client -f k8s/configmaps/
    kubectl apply --dry-run=client -f k8s/stateful/
    kubectl apply --dry-run=client -f k8s/deployments/
    kubectl apply --dry-run=client -f k8s/istio-peer-authentication.yml
    kubectl apply --dry-run=client -f k8s/istio-gateway.yml
    kubectl apply --dry-run=client -f k8s/istio-request-authentication.yml
    kubectl apply --dry-run=client -f k8s/istio-agent-authz.yml
    kubectl apply --dry-run=client -f k8s/monitoring/

[doc("Apply all manifests in dependency order — idempotent, safe to re-run.")]
apply:
    kubectl apply -f k8s/namespace.yml
    kubectl apply -f k8s/configmaps/
    kubectl apply -f k8s/stateful/
    kubectl apply -f k8s/deployments/
    kubectl apply -f k8s/istio-peer-authentication.yml
    kubectl apply -f k8s/istio-gateway.yml
    kubectl apply -f k8s/istio-request-authentication.yml
    kubectl apply -f k8s/istio-agent-authz.yml
    kubectl apply -f k8s/monitoring/

[doc("Full first-time cluster setup: create → gateway-api → istio-install → namespace → secrets → manifests.")]
setup: create gateway-api istio-install
    kubectl apply -f k8s/namespace.yml
    just k8s secrets
    just k8s apply

[doc("Build all Docker images locally, tagged for GHCR.")]
build:
    docker build -t ghcr.io/nickghignatti/ambitwin-frontend:latest ./frontend
    docker build -t ghcr.io/nickghignatti/ambitwin-chat:latest -f backend/chat/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-twin:latest -f backend/digital-twin/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-notification:latest -f backend/notification/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-telemetry:latest -f backend/telemetry/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-socket:latest -f backend/socket/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-agent:latest -f backend/agent/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-dashboard:latest -f backend/dashboard/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-claims-gateway:latest -f backend/claims-gateway/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-provisioner:latest -f backend/provisioner/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-registry:latest -f backend/registry/Dockerfile .
    docker build -t ghcr.io/nickghignatti/ambitwin-tenancy:latest -f backend/tenancy/Dockerfile .

[doc("Push all built images to GHCR (requires: docker login ghcr.io first).")]
push:
    docker push ghcr.io/nickghignatti/ambitwin-frontend:latest
    docker push ghcr.io/nickghignatti/ambitwin-chat:latest
    docker push ghcr.io/nickghignatti/ambitwin-twin:latest
    docker push ghcr.io/nickghignatti/ambitwin-notification:latest
    docker push ghcr.io/nickghignatti/ambitwin-telemetry:latest
    docker push ghcr.io/nickghignatti/ambitwin-socket:latest
    docker push ghcr.io/nickghignatti/ambitwin-agent:latest
    docker push ghcr.io/nickghignatti/ambitwin-dashboard:latest
    docker push ghcr.io/nickghignatti/ambitwin-claims-gateway:latest
    docker push ghcr.io/nickghignatti/ambitwin-provisioner:latest
    docker push ghcr.io/nickghignatti/ambitwin-registry:latest
    docker push ghcr.io/nickghignatti/ambitwin-tenancy:latest

[doc("Build and push in one step (for VPS production deployments).")]
build-push: build push

[doc("Load locally built images directly into k3d (local dev — skips GHCR).")]
load cluster="ambitwin":
    k3d image import ghcr.io/nickghignatti/ambitwin-frontend:latest ghcr.io/nickghignatti/ambitwin-chat:latest ghcr.io/nickghignatti/ambitwin-twin:latest ghcr.io/nickghignatti/ambitwin-notification:latest ghcr.io/nickghignatti/ambitwin-telemetry:latest ghcr.io/nickghignatti/ambitwin-socket:latest ghcr.io/nickghignatti/ambitwin-agent:latest ghcr.io/nickghignatti/ambitwin-dashboard:latest ghcr.io/nickghignatti/ambitwin-claims-gateway:latest ghcr.io/nickghignatti/ambitwin-provisioner:latest ghcr.io/nickghignatti/ambitwin-registry:latest ghcr.io/nickghignatti/ambitwin-tenancy:latest -c {{cluster}}

[doc("Show all pods, deployments, services and StatefulSets in the namespace.")]
status:
    kubectl get all -n ambitwin

[doc("Follow live logs for a service: just k8s logs digital-twin.")]
logs service:
    kubectl logs -n ambitwin -l app={{service}} --tail=100 -f --max-log-requests=10

[doc("Trigger a rolling restart for one service — picks up a new :latest image.")]
restart service:
    kubectl rollout restart deployment/{{service}} -n ambitwin

[doc("Restart all deployments at once (e.g. after rotating secrets).")]
restart-all:
    kubectl rollout restart deployment -n ambitwin

[doc("Watch a rolling update until completion: just k8s rollout digital-twin.")]
rollout service:
    kubectl rollout status deployment/{{service}} -n ambitwin

[doc("Permanently delete the namespace and ALL data inside it.")]
delete:
    kubectl delete namespace ambitwin
