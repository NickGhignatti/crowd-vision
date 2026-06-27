set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

# Bare `just stack` lists recipes.
[private]
default:
    @just --list stack

[doc("Generate .env (VAPID keys, JWT tokens, admin credentials).")]
env:
    mise exec -- node scripts/env/create.js
    mise exec -- node scripts/env/vapid.js
    mise exec -- node scripts/env/token.js
    mise exec -- node scripts/env/config.js
    mise exec -- node scripts/env/admin.js
    mise exec -- node scripts/env/langfuse.js

# Start dev stack with hot-reload. Exclude services by substring of folder name:
#   just stack dev exclude="agent"            → skip agent-service, agent-db, agent-ingester
#   just stack dev exclude="agent simulator"  → also skip aq-simulator, sensor-simulator
[doc("Start dev stack. Use exclude= with space-separated substrings of folder names.")]
dev exclude="": env
    mise exec -- node scripts/compose/compose-run.mjs dev {{exclude}}

[doc("Rebuild then start dev stack. Same exclude= syntax as dev.")]
dev-build exclude="": env
    mise exec -- node scripts/compose/compose-run.mjs dev-build {{exclude}}

[doc("Start production stack (background). Use exclude= with space-separated substrings.")]
start exclude="": env
    mise exec -- node scripts/compose/compose-run.mjs start {{exclude}}

[doc("Stop all containers and remove orphans (always tears down everything).")]
down:
    mise exec -- node scripts/compose/compose-run.mjs down

[doc("Follow logs for all services, or one: just stack logs auth-service.")]
logs service="":
    docker compose -f compose.runtime.yml logs -f {{service}}
