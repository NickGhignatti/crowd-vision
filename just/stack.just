set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list stack

[doc("Generate .env (VAPID keys, local-dev eval JWT secret, Keycloak/Langfuse/control-plane config).")]
env:
    mise exec -- node scripts/env/create.js
    mise exec -- node scripts/env/vapid.js
    mise exec -- node scripts/env/token.js
    mise exec -- node scripts/env/config.js
    mise exec -- node scripts/env/langfuse.js
    mise exec -- node scripts/env/keycloak.js
    mise exec -- node scripts/env/controlplane.js
    mise exec -- node scripts/env/gateway-key.js

[doc("Start dev stack. Use exclude= with space-separated substrings of folder names.")]
dev exclude="": env
    mise exec -- node scripts/compose/compose-run.mjs dev {{exclude}}

[doc("Rebuild then start dev stack. Same exclude= syntax as dev.")]
dev-build exclude="": env
    mise exec -- node scripts/compose/compose-run.mjs dev-build {{exclude}}

[doc("Start dev stack minus agent-service and its Langfuse/ClickHouse/MinIO tracing stack (lighter footprint). Alias for: dev exclude=\"agent\".")]
dev-light: env
    mise exec -- node scripts/compose/compose-run.mjs dev agent

[doc("Start production stack (background). Use exclude= with space-separated substrings.")]
start exclude="": env
    mise exec -- node scripts/compose/compose-run.mjs start {{exclude}}

[doc("Stop all containers and remove orphans (always tears down everything).")]
down:
    mise exec -- node scripts/compose/compose-run.mjs down

[doc("Follow logs for all services, or one: just stack logs twin-service.")]
logs service="":
    docker compose -f compose.runtime.yml logs -f {{service}}
