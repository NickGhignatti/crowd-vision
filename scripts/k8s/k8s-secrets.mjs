#!/usr/bin/env node
// Creates all Kubernetes secrets from the local .env file (idempotent — dry-run then apply).
// Usage: node scripts/k8s/k8s-secrets.mjs

import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const envPath = resolve(root, '.env')
const NS = 'crowdvision'

// ── Parse .env ────────────────────────────────────────────────────────────────

if (!existsSync(envPath)) {
  console.error('❌  .env not found. Run `just stack env` first.')
  process.exit(1)
}

const env = {}
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#\s][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

function need(key, hint = 'Run `just stack env` to (re)generate it.') {
  if (!env[key]) {
    console.error(`❌  Missing ${key} in .env. ${hint}`)
    process.exit(1)
  }
  return env[key]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Generates the Secret YAML via --dry-run=client, then applies it. Args are passed
// as an array (bypassing the shell) so special characters in values are safe unescaped.
function applySecret(name, literals) {
  const createArgs = [
    'create', 'secret', 'generic', name,
    `--namespace=${NS}`,
    '--dry-run=client', '-o', 'yaml',
    ...Object.entries(literals).map(([k, v]) => `--from-literal=${k}=${v}`),
  ]

  const generated = spawnSync('kubectl', createArgs, { encoding: 'utf8' })
  if (generated.status !== 0) {
    console.error(`❌  kubectl create secret ${name}:`, generated.stderr.trim())
    process.exit(1)
  }

  const applied = spawnSync('kubectl', ['apply', '-f', '-'], {
    input: generated.stdout,
    encoding: 'utf8',
  })
  if (applied.status !== 0) {
    console.error(`❌  kubectl apply secret ${name}:`, applied.stderr.trim())
    process.exit(1)
  }

  console.log(`✓  ${name}`)
}

// File-based secrets (mounted as a volume, not envFrom) — e.g. PEM keys.
function applyFileSecret(name, keyName, filePath) {
  const createArgs = [
    'create', 'secret', 'generic', name,
    `--namespace=${NS}`,
    '--dry-run=client', '-o', 'yaml',
    `--from-file=${keyName}=${filePath}`,
  ]

  const generated = spawnSync('kubectl', createArgs, { encoding: 'utf8' })
  if (generated.status !== 0) {
    console.error(`❌  kubectl create secret ${name}:`, generated.stderr.trim())
    process.exit(1)
  }

  const applied = spawnSync('kubectl', ['apply', '-f', '-'], {
    input: generated.stdout,
    encoding: 'utf8',
  })
  if (applied.status !== 0) {
    console.error(`❌  kubectl apply secret ${name}:`, applied.stderr.trim())
    process.exit(1)
  }

  console.log(`✓  ${name}`)
}

// docker-registry secrets use a different kubectl subcommand
function applyDockerSecret(name, server, username, password) {
  const createArgs = [
    'create', 'secret', 'docker-registry', name,
    `--namespace=${NS}`,
    `--docker-server=${server}`,
    `--docker-username=${username}`,
    `--docker-password=${password}`,
    '--dry-run=client', '-o', 'yaml',
  ]

  const generated = spawnSync('kubectl', createArgs, { encoding: 'utf8' })
  if (generated.status !== 0) {
    console.error(`❌  kubectl create secret docker-registry ${name}:`, generated.stderr.trim())
    process.exit(1)
  }

  const applied = spawnSync('kubectl', ['apply', '-f', '-'], {
    input: generated.stdout,
    encoding: 'utf8',
  })
  if (applied.status !== 0) {
    console.error(`❌  kubectl apply secret ${name}:`, applied.stderr.trim())
    process.exit(1)
  }

  console.log(`✓  ${name}`)
}

// ── Create secrets ────────────────────────────────────────────────────────────

console.log(`Creating secrets in namespace "${NS}"...\n`)

applySecret('chat-service-secret', {
  // MongoDB has no password — internal cluster only
  MONGO_URI: 'mongodb://chat-db:27017/chatdb',
})

applySecret('twin-service-secret', {
  MONGO_URI: 'mongodb://twin-db:27017/twindb',
})

applySecret('sensor-service-secret', {
  MONGO_URI: 'mongodb://sensor-db:27017/sensordb',
})

applySecret('notification-service-secret', {
  MONGO_URI: 'mongodb://notification-db:27017/notificationdb',
  VAPID_PUBLIC_KEY: need('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: need('VAPID_PRIVATE_KEY'),
})

applySecret('agent-service-secret', {
  GOOGLE_API_KEY: env['GOOGLE_API_KEY'] ?? '',
  DEEPSEEK_API_KEY: env['DEEPSEEK_API_KEY'] ?? '',
  // app/config.py and alembic/env.py both read POSTGRES_URL (not DATABASE_URL)
  POSTGRES_URL: 'postgresql+asyncpg://agent:agent@agent-db:5432/agentdb',
})

// Credentials used by the agent-db StatefulSet to initialise the database.
// In production, replace the password with a proper randomly-generated value.
applySecret('agent-db-secret', {
  POSTGRES_USER: 'agent',
  POSTGRES_PASSWORD: 'agent',
  POSTGRES_DB: 'agentdb',
})

applySecret('contracts-service-secret', {
  MONGO_URI: 'mongodb://contracts-service-db:27017/contractsdb',
})

// registry-service and tenancy-service are Go, Postgres-backed. Their DB
// StatefulSets read POSTGRES_* to init; the services read DATABASE_URL.
applySecret('registry-db-secret', {
  POSTGRES_USER: 'registry',
  POSTGRES_PASSWORD: need('REGISTRY_DB_PASSWORD'),
  POSTGRES_DB: 'registry',
})

applySecret('tenancy-db-secret', {
  POSTGRES_USER: 'tenancy',
  POSTGRES_PASSWORD: need('TENANCY_DB_PASSWORD'),
  POSTGRES_DB: 'tenancy',
})

applySecret('registry-service-secret', {
  DATABASE_URL: `postgres://registry:${need('REGISTRY_DB_PASSWORD')}@registry-db:5432/registry?sslmode=disable`,
  INTERNAL_SIGNING_SECRET: need('INTERNAL_SIGNING_SECRET'),
})

applySecret('tenancy-service-secret', {
  DATABASE_URL: `postgres://tenancy:${need('TENANCY_DB_PASSWORD')}@tenancy-db:5432/tenancy?sslmode=disable`,
  INTERNAL_SIGNING_SECRET: need('INTERNAL_SIGNING_SECRET'),
})

applySecret('provisioner-secret', {
  INTERNAL_SIGNING_SECRET: need('INTERNAL_SIGNING_SECRET'),
})

// Grafana admin login — dev default here; production sets GRAFANA_ADMIN_PASSWORD in .env.
applySecret('grafana-secret', {
  GF_SECURITY_ADMIN_USER: env['GRAFANA_ADMIN_USER'] ?? 'admin',
  GF_SECURITY_ADMIN_PASSWORD: env['GRAFANA_ADMIN_PASSWORD'] ?? 'crowdvision',
})

// cv-gateway's confidential client secret for server-side password login/registration
// against Keycloak, plus the internal token secret.
applySecret('claims-gateway-secret', {
  INTERNAL_SIGNING_SECRET: need('INTERNAL_SIGNING_SECRET'),
  REGISTRATION_CLIENT_SECRET: env['CV_GATEWAY_CLIENT_SECRET'] ?? 'dev-only-not-for-production',
})

// Stable dev signing key so restarts don't rotate it and invalidate every
// session/JWKS cache (mirrors docker-compose's secrets/gateway-dev-key.pem mount).
applyFileSecret('claims-gateway-key', 'gateway-key.pem', resolve(root, 'secrets/gateway-dev-key.pem'))

// Image pull credentials for ghcr.io — optional: the crowdvision-* packages are
// public, so anonymous pulls already work. Only needed if you're pulling from a
// private fork/registry. (A wrong/placeholder token is worse than none: GHCR 403s
// on bad credentials instead of falling back to anonymous.)
if (env['GHCR_USERNAME'] && env['GHCR_TOKEN']) {
  applyDockerSecret('ghcr-pull-secret', 'ghcr.io', env['GHCR_USERNAME'], env['GHCR_TOKEN'])
} else {
  console.log('⏩  ghcr-pull-secret (skipped — GHCR_USERNAME/GHCR_TOKEN not set, not required for public images)')
}

console.log('\n✅  All secrets applied.')
