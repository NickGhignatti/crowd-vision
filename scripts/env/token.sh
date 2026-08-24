#!/bin/sh
set -eu
. "$(dirname -- "$0")/lib.sh"

if env_has "EVAL_JWT_SECRET"; then
    exit 0
fi

echo "🔑 Generating secure eval JWT secret..."

env_append <<EOF

# Eval JWT Secret (Auto-Generated, 256-bit) — local-dev-only, see agent-service/CLAUDE.md
EVAL_JWT_SECRET=$(hex 32)
EOF

echo "✅ EVAL_JWT_SECRET generated and appended to .env"
