#!/usr/bin/env bash
# Runs tests/*.rs against a real Redis, both inside the same compose network
# (container-to-container) so the test process never depends on a
# host-published port. `src/` unit tests (cargo test --lib) need none of this.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PROJECT_NAME="socket-service-integration-tests"
COMPOSE=(docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml)

"${COMPOSE[@]}" up --build --exit-code-from socket-service-test --abort-on-container-exit
exit_code=$?

"${COMPOSE[@]}" down --remove-orphans --volumes

exit "$exit_code"
