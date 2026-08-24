#!/bin/sh
set -eu
. "$(dirname -- "$0")/lib.sh"

secrets_dir="$ROOT/secrets"
key_path="$secrets_dir/gateway-dev-key.pem"

if [ -e "$key_path" ]; then
    exit 0
fi

echo "🔑 Generating stable gateway signing key (dev)..."

mkdir -p "$secrets_dir"
tmp=$(umask 077; mktemp "$secrets_dir/.gateway-dev-key.XXXXXX")
trap 'rm -f "$tmp"' EXIT

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$tmp" 2>/dev/null

if ln "$tmp" "$key_path" 2>/dev/null; then
    echo "✅ Gateway signing key written to secrets/gateway-dev-key.pem"
fi
