#!/usr/bin/env bash
# Runs tests/*.rs against a real MongoDB, all inside the same compose network
# (container-to-container) so the test process never depends on a host-published
# port. `src/` unit tests (cargo test --lib) need none of this.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# The base image's compiler comes from the one pin in .mise.toml; this project
# runs standalone, so nothing else puts RUST_VERSION in the environment.
RUST_VERSION=$(sed -n 's/^rust = "\(.*\)"$/\1/p' ../../.mise.toml)
export RUST_VERSION

PROJECT_NAME="chat-integration-tests"
COMPOSE=(docker compose -p "$PROJECT_NAME" -f docker-compose.test.yml)

"${COMPOSE[@]}" up --build --exit-code-from chat-test --abort-on-container-exit
exit_code=$?

"${COMPOSE[@]}" down --remove-orphans --volumes

exit "$exit_code"
