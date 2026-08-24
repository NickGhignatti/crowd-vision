#!/bin/sh
set -eu
. "$(dirname -- "$0")/lib.sh"

pending=""

for entry in "BACKEND_PORT=80" "FRONTEND_PORT=8080" "DEV_URL=http://localhost"; do
    env_key_set "${entry%%=*}" || pending="$pending$entry
"
done

if ! env_key_set OPENROUTER_API_KEY; then
    printf 'Enter OPENROUTER_API_KEY (leave empty to skip) []: '
    read -r answer || answer=""
    pending="${pending}OPENROUTER_API_KEY=$answer
"
fi

[ -n "$pending" ] || exit 0

printf '\n# Generated interactively by config script\n%s' "$pending" | env_append
echo "✅ Saved new configuration to .env."
