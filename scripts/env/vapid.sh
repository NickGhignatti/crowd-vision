#!/bin/sh
set -eu
. "$(dirname -- "$0")/lib.sh"

if env_has "VAPID_PUBLIC_KEY"; then
    exit 0
fi

echo "🔑 Generating VAPID keys for Web Push..."

b64url() { base64 | tr -d '\n' | tr '+/' '-_' | tr -d '='; }

tmp=$(umask 077; mktemp)
trap 'rm -f "$tmp"' EXIT

openssl ecparam -name prime256v1 -genkey -noout -out "$tmp" 2>/dev/null
public_key=$(openssl ec -in "$tmp" -pubout -outform DER 2>/dev/null | tail -c 65 | b64url)
private_key=$(openssl ec -in "$tmp" -outform DER 2>/dev/null | dd bs=1 skip=7 count=32 2>/dev/null | b64url)

if [ "${#public_key}" -ne 87 ] || [ "${#private_key}" -ne 43 ]; then
    echo "❌ Unexpected VAPID key length (pub ${#public_key}, priv ${#private_key}; want 87/43)." >&2
    exit 1
fi

env_append <<EOF

# Web Push Keys (Auto-Generated)
VAPID_PUBLIC_KEY=$public_key
VAPID_PRIVATE_KEY=$private_key
VITE_VAPID_PUBLIC_KEY=$public_key
EOF

echo "✅ VAPID keys generated and appended to .env"
