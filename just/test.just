set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

# Bare `just test` lists recipes.
[private]
default:
    @just --list test

# Run all unit tests across all services (moon handles caching + task graph)
all:
    mise exec -- moon run :test

# Run only tests for services affected by changes on the current branch
affected:
    mise exec -- moon run :test --affected

# Per-service unit tests
auth:
    mise exec -- moon run auth-service:test

chat:
    mise exec -- moon run chat-service:test

twin:
    mise exec -- moon run twin-service:test

notification:
    mise exec -- moon run notification-service:test

sensor:
    mise exec -- moon run sensor-service:test

socket:
    mise exec -- moon run socket-service:test

client:
    mise exec -- moon run client:test

agent:
    mise exec -- moon run agent-service:test

# Agent Python integration tests (separate suite from the docker-compose one)
agent-integration:
    mise exec -- uv run --directory server/agent-service pytest tests/integration

# Run the agent golden-dataset evaluation against the local stack (auto-mints JWTs)
eval models="" judge="":
    #!/usr/bin/env bash
    models='{{models}}'; models="${models#models=}"
    judge='{{judge}}'; judge="${judge#judge=}"
    args=(--report-only --models "$models")
    [ -n "$judge" ] && args+=(--judge-model "$judge")
    mise exec -- uv run --directory server/agent-service python evals/run_evals.py "${args[@]}"

# Run backend integration tests against a composed stack (full stack, no exclusion)
integration:
    mise exec -- node scripts/compose/compose-run.mjs integration
    mise exec -- node scripts/compose/compose-run.mjs down
