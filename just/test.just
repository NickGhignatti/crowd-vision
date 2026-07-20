set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list test

[doc("Run all unit tests across all services (moon handles caching + task graph).")]
all:
    mise exec -- moon run :test

[doc("Run only tests for services affected by changes on the current branch.")]
affected:
    mise exec -- moon run :test --affected

[doc("Unit tests for chat-service.")]
chat:
    mise exec -- moon run chat-service:test

[doc("Unit tests for twin-service.")]
twin:
    mise exec -- moon run twin-service:test

[doc("Unit tests for notification-service.")]
notification:
    mise exec -- moon run notification-service:test

[doc("Unit tests for sensor-service.")]
sensor:
    mise exec -- moon run sensor-service:test

[doc("Unit tests for socket-service.")]
socket:
    mise exec -- moon run socket-service:test

[doc("Unit tests for the client (frontend).")]
client:
    mise exec -- moon run client:test

[doc("Unit tests for agent-service.")]
agent:
    mise exec -- moon run agent-service:test

[doc("Agent Python integration tests (separate suite from the docker-compose one).")]
agent-integration:
    mise exec -- uv run --directory server/agent-service pytest tests/integration

[doc("Run the agent golden-dataset evaluation against the local stack (auto-mints JWTs).")]
eval models="" judge="":
    #!/usr/bin/env bash
    models='{{models}}'; models="${models#models=}"
    judge='{{judge}}'; judge="${judge#judge=}"
    args=(--report-only --models "$models")
    [ -n "$judge" ] && args+=(--judge-model "$judge")
    mise exec -- uv run --directory server/agent-service python evals/run_evals.py "${args[@]}"

[doc("Run backend integration tests against a composed stack (full stack, no exclusion).")]
integration:
    mise exec -- node scripts/compose/compose-run.mjs integration
    mise exec -- node scripts/compose/compose-run.mjs down
