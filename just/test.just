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

[doc("Unit tests for chat.")]
chat:
    mise exec -- moon run chat:test

[doc("Integration tests for chat — starts a throwaway MongoDB, runs tests/*.rs, tears it down.")]
chat-integration:
    mise exec -- moon run chat:test-integration

[doc("Unit tests for telemetry.")]
telemetry:
    mise exec -- moon run telemetry:test

[doc("Integration tests for telemetry — throwaway TimescaleDB, runs tests/*.rs, tears it down.")]
telemetry-integration:
    mise exec -- moon run telemetry:test-integration

[doc("Unit tests for digital-twin.")]
twin:
    mise exec -- moon run digital-twin:test

[doc("Integration tests for digital-twin — starts a throwaway MongoDB, runs tests/*.rs, tears it down.")]
twin-integration:
    mise exec -- moon run digital-twin:test-integration

[doc("Unit tests for notification.")]
notification:
    mise exec -- moon run notification:test

[doc("Integration tests for notification — starts a throwaway MongoDB and Redis, runs tests/*.rs, tears them down.")]
notification-integration:
    mise exec -- moon run notification:test-integration

[doc("Unit tests for socket.")]
socket:
    mise exec -- moon run socket:test

[doc("Integration tests for socket — starts a throwaway Redis, runs tests/*.rs, tears it down.")]
socket-integration:
    mise exec -- moon run socket:test-integration

[doc("Integration tests for registry — testcontainers Postgres behind the `integration` build tag.")]
registry-integration:
    mise exec -- moon run registry:test-integration

[doc("Integration tests for tenancy — testcontainers Postgres plus the account-deleted consumer.")]
tenancy-integration:
    mise exec -- moon run tenancy:test-integration

[doc("Unit tests for the frontend.")]
frontend:
    mise exec -- moon run frontend:test

[doc("Unit tests for agent.")]
agent:
    mise exec -- moon run agent:test

[doc("Agent Python integration tests (separate suite from the docker-compose one).")]
agent-integration:
    mise exec -- uv run --directory backend/agent pytest tests/integration

[doc("Run the agent golden-dataset evaluation against the local stack (auto-mints JWTs).")]
eval models="" judge="":
    #!/usr/bin/env bash
    models='{{models}}'; models="${models#models=}"
    judge='{{judge}}'; judge="${judge#judge=}"
    args=(--report-only --models "$models")
    [ -n "$judge" ] && args+=(--judge-model "$judge")
    mise exec -- uv run --directory backend/agent python evals/run_evals.py "${args[@]}"

[doc("Run backend integration tests — only the services backend/acceptance actually exercises, not the full stack.")]
integration:
    bash backend/acceptance/run-integration-tests.sh
    @mise exec -- python3 scripts/compose/compose-run.py down
