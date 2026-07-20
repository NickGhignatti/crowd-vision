#!/usr/bin/env node
// Bumps the "version" field across every Node package in the monorepo to argv[2].
// Invoked by semantic-release's @semantic-release/exec `prepareCmd` (see tooling/.releaserc).

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const version = process.argv[2]
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Usage: node bump-versions.mjs <semver>\nGot: ${version ?? '(none)'}`)
  process.exit(1)
}

// Discover the set of package.json files to bump: client + every direct subdirectory
// of server/. Simulators and the tooling package itself are not versioned.
const targets = [join(REPO_ROOT, 'client', 'package.json')]
const serverDir = join(REPO_ROOT, 'server')
for (const entry of readdirSync(serverDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const pkg = join(serverDir, entry.name, 'package.json')
  try {
    if (statSync(pkg).isFile()) targets.push(pkg)
  } catch {
    // No package.json in this server subdir (e.g. contracts-service is Rust). Skip.
  }
}

function bumpJson(path, mutate) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return false
  }
  const obj = JSON.parse(raw)
  if (!mutate(obj)) return false
  const trailingNl = raw.endsWith('\n') ? '\n' : ''
  writeFileSync(path, JSON.stringify(obj, null, 2) + trailingNl)
  return true
}

// Bump the first `version = "x.y.z"` line in a TOML file (Cargo.toml/pyproject.toml) —
// the package-level version, not dependency version strings.
function bumpToml(path, label) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return false
  }
  const updated = raw.replace(/^(version\s*=\s*)"[^"]*"/m, `$1"${version}"`)
  if (updated === raw) return false
  writeFileSync(path, updated)
  console.log(`  bumped ${path} (${label}) → ${version}`)
  return true
}

let bumped = 0
for (const path of targets) {
  const ok = bumpJson(path, (pkg) => {
    if (typeof pkg.version !== 'string') return false
    pkg.version = version
    return true
  })
  if (!ok) {
    console.log(`  skip ${path} (no "version" field)`)
    continue
  }
  console.log(`  bumped ${path} → ${version}`)
  bumped++

  // Keep the corresponding package-lock.json in sync so npm ci doesn't error.
  const lockPath = path.replace(/package\.json$/, 'package-lock.json')
  const lockOk = bumpJson(lockPath, (lock) => {
    let touched = false
    if (typeof lock.version === 'string') { lock.version = version; touched = true }
    if (lock.packages && lock.packages[''] && typeof lock.packages[''].version === 'string') {
      lock.packages[''].version = version
      touched = true
    }
    return touched
  })
  if (lockOk) console.log(`    + lockfile: ${lockPath}`)
}

// Bump Rust and Python packages so the full monorepo stays in version sync.
bumpToml(join(REPO_ROOT, 'server', 'contracts-service', 'Cargo.toml'), 'Rust')
bumpToml(join(REPO_ROOT, 'server', 'agent-service', 'pyproject.toml'), 'Python')

console.log(`\nDone. Bumped ${bumped} package.json file(s) to ${version}.`)
