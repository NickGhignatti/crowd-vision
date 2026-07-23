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
    @echo "  127.0.0.1   crowdvision.local"

[doc("Stop the cluster (pause all containers, data is preserved).")]
stop:
    k3d cluster stop crowdvision

[doc("Resume a stopped cluster (port bindings preserved).")]
start:
    k3d cluster start crowdvision

[doc("Create a fresh k3d cluster named crowdvision (run once).")]
create:
    k3d cluster create crowdvision -p "80:80@loadbalancer" -p "443:443@loadbalancer" --api-port 6550 --k3s-arg "--disable=traefik@server:0" --wait --timeout 120s

[doc("Install the Gateway API CRDs (required for the ingress Gateway/HTTPRoute).")]
gateway-api:
    kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

[doc("Install Istio in ambient mode with k3d-correct CNI paths (run once per cluster).")]
istio-install:
    mise exec -- istioctl install --set profile=ambient --set values.cni.cniConfDir=/var/lib/rancher/k3s/agent/etc/cni/net.d --set values.cni.cniBinDir=/bin -y

[doc("Create or update all Kubernetes secrets from your .env file.")]
secrets:
    mise exec -- node scripts/k8s/k8s-secrets.mjs

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
    docker build -t ghcr.io/nickghignatti/crowdvision-client:latest ./client
    docker build -t ghcr.io/nickghignatti/crowdvision-chat:latest ./server/chat-service
    docker build -t ghcr.io/nickghignatti/crowdvision-twin:latest -f server/twin-service/Dockerfile .
    docker build -t ghcr.io/nickghignatti/crowdvision-notification:latest ./server/notification-service
    docker build -t ghcr.io/nickghignatti/crowdvision-sensor:latest ./server/sensor-service
    docker build -t ghcr.io/nickghignatti/crowdvision-socket:latest ./server/socket-service
    docker build -t ghcr.io/nickghignatti/crowdvision-agent:latest -f server/agent-service/Dockerfile .
    docker build -t ghcr.io/nickghignatti/crowdvision-contracts:latest ./server/contracts-service
    docker build -t ghcr.io/nickghignatti/crowdvision-claims-gateway:latest -f server/claims-gateway/Dockerfile .
    docker build -t ghcr.io/nickghignatti/crowdvision-provisioner:latest -f server/provisioner/Dockerfile .
    docker build -t ghcr.io/nickghignatti/crowdvision-registry:latest -f server/registry-service/Dockerfile .
    docker build -t ghcr.io/nickghignatti/crowdvision-tenancy:latest -f server/tenancy-service/Dockerfile .

[doc("Push all built images to GHCR (requires: docker login ghcr.io first).")]
push:
    docker push ghcr.io/nickghignatti/crowdvision-client:latest
    docker push ghcr.io/nickghignatti/crowdvision-chat:latest
    docker push ghcr.io/nickghignatti/crowdvision-twin:latest
    docker push ghcr.io/nickghignatti/crowdvision-notification:latest
    docker push ghcr.io/nickghignatti/crowdvision-sensor:latest
    docker push ghcr.io/nickghignatti/crowdvision-socket:latest
    docker push ghcr.io/nickghignatti/crowdvision-agent:latest
    docker push ghcr.io/nickghignatti/crowdvision-contracts:latest
    docker push ghcr.io/nickghignatti/crowdvision-claims-gateway:latest
    docker push ghcr.io/nickghignatti/crowdvision-provisioner:latest
    docker push ghcr.io/nickghignatti/crowdvision-registry:latest
    docker push ghcr.io/nickghignatti/crowdvision-tenancy:latest

[doc("Build and push in one step (for VPS production deployments).")]
build-push: build push

[doc("Load locally built images directly into k3d (local dev — skips GHCR).")]
load cluster="crowdvision":
    k3d image import ghcr.io/nickghignatti/crowdvision-client:latest ghcr.io/nickghignatti/crowdvision-chat:latest ghcr.io/nickghignatti/crowdvision-twin:latest ghcr.io/nickghignatti/crowdvision-notification:latest ghcr.io/nickghignatti/crowdvision-sensor:latest ghcr.io/nickghignatti/crowdvision-socket:latest ghcr.io/nickghignatti/crowdvision-agent:latest ghcr.io/nickghignatti/crowdvision-contracts:latest ghcr.io/nickghignatti/crowdvision-claims-gateway:latest ghcr.io/nickghignatti/crowdvision-provisioner:latest ghcr.io/nickghignatti/crowdvision-registry:latest ghcr.io/nickghignatti/crowdvision-tenancy:latest -c {{cluster}}

[doc("Show all pods, deployments, services and StatefulSets in the namespace.")]
status:
    kubectl get all -n crowdvision

[doc("Follow live logs for a service: just k8s logs twin-service.")]
logs service:
    kubectl logs -n crowdvision -l app={{service}} --tail=100 -f --max-log-requests=10

[doc("Trigger a rolling restart for one service — picks up a new :latest image.")]
restart service:
    kubectl rollout restart deployment/{{service}} -n crowdvision

[doc("Restart all deployments at once (e.g. after rotating secrets).")]
restart-all:
    kubectl rollout restart deployment -n crowdvision

[doc("Watch a rolling update until completion: just k8s rollout twin-service.")]
rollout service:
    kubectl rollout status deployment/{{service}} -n crowdvision

[doc("Permanently delete the namespace and ALL data inside it.")]
delete:
    kubectl delete namespace crowdvision
