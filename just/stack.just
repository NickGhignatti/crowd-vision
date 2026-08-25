set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list stack

[doc("Generate .env (VAPID keys, local-dev eval JWT secret, Keycloak/Langfuse/control-plane config).")]
env:
    @mise exec -- sh scripts/env/create.sh
    @mise exec -- sh scripts/env/vapid.sh
    @mise exec -- sh scripts/env/token.sh
    @mise exec -- sh scripts/env/config.sh
    @mise exec -- sh scripts/env/langfuse.sh
    @mise exec -- sh scripts/env/keycloak.sh
    @mise exec -- sh scripts/env/controlplane.sh
    @mise exec -- sh scripts/env/gateway-key.sh
    @mise exec -- sh scripts/env/ingest-key.sh
    @mise exec -- sh scripts/env/telemetry-db.sh

[doc("Start dev stack. Flags: --build --no-agent --no-metrics --no-simulators --dry-run, or bare substrings.")]
dev *args: env
    @mise exec -- python3 scripts/compose/compose-run.py dev {{args}}

[doc("Start production stack (background). Same flags as dev.")]
start *args: env
    @mise exec -- python3 scripts/compose/compose-run.py start {{args}}

[doc("Stop all containers and remove orphans (always tears down everything).")]
down *args:
    @mise exec -- python3 scripts/compose/compose-run.py down {{args}}

[doc("Follow logs for all services, or one: just stack logs digital-twin.")]
logs service="":
    docker compose -f compose.runtime.yml logs -f {{service}}
