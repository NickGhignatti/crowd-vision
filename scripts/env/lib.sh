ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
ENV_PATH=${ENV_FILE:-$ROOT/.env}

hex() { openssl rand -hex "$1"; }

env_has() { [ -f "$ENV_PATH" ] && grep -qF "$1" "$ENV_PATH"; }

env_key_set() { [ -f "$ENV_PATH" ] && grep -qE "^[[:space:]]*$1[[:space:]]*=" "$ENV_PATH"; }

env_append() { ( umask 077; cat >> "$ENV_PATH" ); }
