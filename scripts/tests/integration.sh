#!/usr/bin/env bash
set -euo pipefail

# Runs on exit regardless of how the script ends
trap 'echo ""; read -rp "Press Enter to close..."' EXIT

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "==> Starting services..."
docker compose -f docker/docker-compose.integration.yml up -d --build

echo ""
echo "==> Installing test dependencies..."
npm install --prefix server/tests

echo ""
echo "==> Running tests..."
set +e
npm test --prefix server/tests
TEST_EXIT=$?
set -e

echo ""
echo "==> Stopping services..."
docker compose -f docker/docker-compose.integration.yml down -v

echo ""
if [ $TEST_EXIT -eq 0 ]; then
  echo "PASSED"
else
  echo "FAILED (exit code $TEST_EXIT)"
fi

# Keep window open in Git Bash
if [ -t 0 ]; then read -rp "Press Enter to close..."; fi

exit $TEST_EXIT
