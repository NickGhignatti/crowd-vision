#!/usr/bin/env node
// Creates all Kubernetes secrets needed by CrowdVision from the local .env file.
// Idempotent: generates each secret with --dry-run=client then pipes to kubectl apply.
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

function need(key) {
  if (!env[key]) {
    console.error(`❌  Missing ${key} in .env. Run \`just stack env\` to (re)generate it.`)
    process.exit(1)
  }
  return env[key]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Generates the Secret YAML via --dry-run=client, then applies it.
// Passing args as an array bypasses the shell, so special characters
// in values (base64 padding, = signs, etc.) are safe without escaping.
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

applySecret('authentication-service-secret', {
  JWT_SECRET: need('JWT_SECRET'),
  INTERNAL_ADMIN_SECRET: need('INTERNAL_ADMIN_SECRET'),
  // MongoDB has no password — internal cluster only
  MONGO_URI: 'mongodb://auth-db:27017/authdb',
})

applySecret('chat-service-secret', {
  // chat-service verifies the same user JWTs as auth/agent — shared secret.
  JWT_SECRET: need('JWT_SECRET'),
  // MongoDB has no password — internal cluster only
  MONGO_URI: 'mongodb://chat-db:27017/chatdb',
})

applySecret('twin-service-secret', {
  MONGO_URI: 'mongodb://twin-db:27017/twindb',
  // twin-service authenticates its routes against the same user JWTs.
  JWT_SECRET: need('JWT_SECRET'),
})

applySecret('sensor-service-secret', {
  MONGO_URI: 'mongodb://sensor-db:27017/sensordb',
  // sensor-service authenticates its read/threshold routes — shared secret.
  JWT_SECRET: need('JWT_SECRET'),
})

applySecret('notification-service-secret', {
  MONGO_URI: 'mongodb://notification-db:27017/notificationdb',
  VAPID_PUBLIC_KEY: need('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: need('VAPID_PRIVATE_KEY'),
  // notification-service authenticates its routes — shared secret.
  JWT_SECRET: need('JWT_SECRET'),
})

applySecret('agent-service-secret', {
  GOOGLE_API_KEY: env['GOOGLE_API_KEY'] ?? '',
  DEEPSEEK_API_KEY: env['DEEPSEEK_API_KEY'] ?? '',
  // app/config.py and alembic/env.py both read POSTGRES_URL (not DATABASE_URL)
  POSTGRES_URL: 'postgresql+asyncpg://agent:agent@agent-db:5432/agentdb',
  // agent-service verifies user JWTs — must match auth-service's secret
  JWT_SECRET: need('JWT_SECRET'),
})

// Credentials used by the agent-db StatefulSet to initialise the database.
// In production, replace the password with a proper randomly-generated value.
applySecret('agent-db-secret', {
  POSTGRES_USER: 'agent',
  POSTGRES_PASSWORD: 'agent',
  POSTGRES_DB: 'agentdb',
})

// Image pull credentials for ghcr.io (private registry)
applyDockerSecret(
  'ghcr-pull-secret',
  'ghcr.io',
  need('GHCR_USERNAME'),
  need('GHCR_TOKEN'),
)

console.log('\n✅  All secrets applied.')
