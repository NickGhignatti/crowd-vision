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

[doc("Integration tests for chat-service — starts a throwaway MongoDB, runs tests/*.rs, tears it down.")]
chat-integration:
    mise exec -- moon run chat-service:test-integration

[doc("Unit tests for telemetry-service.")]
telemetry:
    mise exec -- moon run telemetry-service:test

[doc("Integration tests for telemetry-service — throwaway TimescaleDB, runs tests/*.rs, tears it down.")]
telemetry-integration:
    mise exec -- moon run telemetry-service:test-integration

[doc("Unit tests for twin-service.")]
twin:
    mise exec -- moon run twin-service:test

[doc("Integration tests for twin-service — starts a throwaway MongoDB, runs tests/*.rs, tears it down.")]
twin-integration:
    mise exec -- moon run twin-service:test-integration

[doc("Unit tests for notification-service.")]
notification:
    mise exec -- moon run notification-service:test

[doc("Integration tests for notification-service — starts a throwaway MongoDB and Redis, runs tests/*.rs, tears them down.")]
notification-integration:
    mise exec -- moon run notification-service:test-integration

[doc("Unit tests for socket-service.")]
socket:
    mise exec -- moon run socket-service:test

[doc("Integration tests for socket-service — starts a throwaway Redis, runs tests/*.rs, tears it down.")]
socket-integration:
    mise exec -- moon run socket-service:test-integration

[doc("Unit tests for the frontend.")]
frontend:
    mise exec -- moon run frontend:test

[doc("Unit tests for agent-service.")]
agent:
    mise exec -- moon run agent-service:test

[doc("Agent Python integration tests (separate suite from the docker-compose one).")]
agent-integration:
    mise exec -- uv run --directory backend/agent-service pytest tests/integration

[doc("Run the agent golden-dataset evaluation against the local stack (auto-mints JWTs).")]
eval models="" judge="":
    #!/usr/bin/env bash
    models='{{models}}'; models="${models#models=}"
    judge='{{judge}}'; judge="${judge#judge=}"
    args=(--report-only --models "$models")
    [ -n "$judge" ] && args+=(--judge-model "$judge")
    mise exec -- uv run --directory backend/agent-service python evals/run_evals.py "${args[@]}"

[doc("Run backend integration tests — only the services backend/tests actually exercises, not the full stack.")]
integration:
    bash backend/tests/run-integration-tests.sh
    @mise exec -- python3 scripts/compose/compose-run.py down
