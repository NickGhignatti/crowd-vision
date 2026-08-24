#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ENV_PATH=${ENV_FILE:-$ROOT/.env}
NS=crowdvision

if [ ! -f "$ENV_PATH" ]; then
    echo "❌  .env not found. Run \`just stack env\` first." >&2
    exit 1
fi

env_get() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=//p" "$ENV_PATH" |
        tail -n 1 |
        sed "s/^[[:space:]]*//; s/[[:space:]]*\$//; s/^[\"']//; s/[\"']\$//"
}

need() {
    value=$(env_get "$1")
    if [ -z "$value" ]; then
        echo "❌  Missing $1 in .env. Run \`just stack env\` to (re)generate it." >&2
        exit 1
    fi
    printf '%s' "$value"
}

apply() {
    kind=$1
    name=$2
    shift 2
    manifest=$(kubectl create secret "$kind" "$name" \
        --namespace="$NS" --dry-run=client -o yaml "$@") || {
        echo "❌  kubectl create secret $name failed" >&2
        exit 1
    }
    printf '%s\n' "$manifest" | kubectl apply -f - >/dev/null || {
        echo "❌  kubectl apply secret $name failed" >&2
        exit 1
    }
    echo "✓  $name"
}

telemetry_db_password=$(need TELEMETRY_DB_PASSWORD)
telemetry_ingest_secret=$(need TELEMETRY_INGEST_SECRET)
vapid_public_key=$(need VAPID_PUBLIC_KEY)
vapid_private_key=$(need VAPID_PRIVATE_KEY)
registry_db_password=$(need REGISTRY_DB_PASSWORD)
tenancy_db_password=$(need TENANCY_DB_PASSWORD)
internal_signing_secret=$(need INTERNAL_SIGNING_SECRET)

google_api_key=$(env_get GOOGLE_API_KEY)
deepseek_api_key=$(env_get DEEPSEEK_API_KEY)
grafana_admin_user=$(env_get GRAFANA_ADMIN_USER)
grafana_admin_password=$(env_get GRAFANA_ADMIN_PASSWORD)
gateway_client_secret=$(env_get CV_GATEWAY_CLIENT_SECRET)
ghcr_username=$(env_get GHCR_USERNAME)
ghcr_token=$(env_get GHCR_TOKEN)

: "${grafana_admin_user:=admin}"
: "${grafana_admin_password:=crowdvision}"
: "${gateway_client_secret:=dev-only-not-for-production}"

echo "Creating secrets in namespace \"$NS\"..."
echo

apply generic chat-service-secret \
    --from-literal=MONGO_URI=mongodb://chat-db:27017/chatdb

apply generic twin-service-secret \
    --from-literal=MONGO_URI=mongodb://twin-db:27017/twindb

apply generic telemetry-service-secret \
    --from-literal=DATABASE_URL="postgres://telemetry:$telemetry_db_password@telemetry-db:5432/telemetrydb" \
    --from-literal=TELEMETRY_INGEST_SECRET="$telemetry_ingest_secret"

apply generic telemetry-db-secret \
    --from-literal=POSTGRES_USER=telemetry \
    --from-literal=POSTGRES_PASSWORD="$telemetry_db_password" \
    --from-literal=POSTGRES_DB=telemetrydb

apply generic notification-service-secret \
    --from-literal=MONGO_URI=mongodb://notification-db:27017/notificationdb \
    --from-literal=VAPID_PUBLIC_KEY="$vapid_public_key" \
    --from-literal=VAPID_PRIVATE_KEY="$vapid_private_key"

apply generic agent-service-secret \
    --from-literal=GOOGLE_API_KEY="$google_api_key" \
    --from-literal=DEEPSEEK_API_KEY="$deepseek_api_key" \
    --from-literal=POSTGRES_URL=postgresql+asyncpg://agent:agent@agent-db:5432/agentdb

apply generic agent-db-secret \
    --from-literal=POSTGRES_USER=agent \
    --from-literal=POSTGRES_PASSWORD=agent \
    --from-literal=POSTGRES_DB=agentdb

apply generic contracts-service-secret \
    --from-literal=MONGO_URI=mongodb://contracts-service-db:27017/contractsdb

apply generic registry-db-secret \
    --from-literal=POSTGRES_USER=registry \
    --from-literal=POSTGRES_PASSWORD="$registry_db_password" \
    --from-literal=POSTGRES_DB=registry

apply generic tenancy-db-secret \
    --from-literal=POSTGRES_USER=tenancy \
    --from-literal=POSTGRES_PASSWORD="$tenancy_db_password" \
    --from-literal=POSTGRES_DB=tenancy

apply generic registry-service-secret \
    --from-literal=DATABASE_URL="postgres://registry:$registry_db_password@registry-db:5432/registry?sslmode=disable" \
    --from-literal=INTERNAL_SIGNING_SECRET="$internal_signing_secret"

apply generic tenancy-service-secret \
    --from-literal=DATABASE_URL="postgres://tenancy:$tenancy_db_password@tenancy-db:5432/tenancy?sslmode=disable" \
    --from-literal=INTERNAL_SIGNING_SECRET="$internal_signing_secret"

apply generic provisioner-secret \
    --from-literal=INTERNAL_SIGNING_SECRET="$internal_signing_secret"

apply generic grafana-secret \
    --from-literal=GF_SECURITY_ADMIN_USER="$grafana_admin_user" \
    --from-literal=GF_SECURITY_ADMIN_PASSWORD="$grafana_admin_password"

apply generic claims-gateway-secret \
    --from-literal=INTERNAL_SIGNING_SECRET="$internal_signing_secret" \
    --from-literal=REGISTRATION_CLIENT_SECRET="$gateway_client_secret"

apply generic claims-gateway-key \
    --from-file=gateway-key.pem="$ROOT/secrets/gateway-dev-key.pem"

if [ -n "$ghcr_username" ] && [ -n "$ghcr_token" ]; then
    apply docker-registry ghcr-pull-secret \
        --docker-server=ghcr.io \
        --docker-username="$ghcr_username" \
        --docker-password="$ghcr_token"
else
    echo "⏩  ghcr-pull-secret (skipped — GHCR_USERNAME/GHCR_TOKEN not set, not required for public images)"
fi

echo
echo "✅  All secrets applied."
