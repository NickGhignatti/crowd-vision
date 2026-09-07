#!/usr/bin/env bash
# Runs tests/*.rs against a real MongoDB and Redis, inside the compose network so no
# host-published port is needed. Unit tests (cargo test --lib) need none of this.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PROJECT_NAME="dashboard-integration-tests"
COMPOSE=(docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml)

"${COMPOSE[@]}" up --build --exit-code-from dashboard-test --abort-on-container-exit
exit_code=$?

"${COMPOSE[@]}" down --remove-orphans --volumes

exit "$exit_code"
