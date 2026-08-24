#!/bin/sh
set -eu
. "$(dirname -- "$0")/lib.sh"

if (umask 077; set -C; : > "$ENV_PATH") 2>/dev/null; then
    echo "📝 Creating .env file with default configuration..."
fi
