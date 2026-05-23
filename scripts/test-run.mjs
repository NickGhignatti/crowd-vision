//
// Cross-platform test runner.
//
// Runs the test suite for one service, all services, or in parallel.
// Mirrors compose-run.mjs in spirit: a small Node helper invoked from the
// Justfile so the user-facing command is always `just test*`, not `npm`.
//
// Usage:
//   node scripts/test-run.mjs all          # run every service sequentially
//   node scripts/test-run.mjs all --parallel
//   node scripts/test-run.mjs <name>       # one service (auth, twin, ...)
//

import { spawn, spawnSync } from 'node:child_process';

// ── Test catalog ─────────────────────────────────────────────────────────────
// `cwd` is run from project root. `cmd` is a shell string so each service's
// own quoting rules (e.g. cross-env, NODE_OPTIONS) stay intact.
const SUITES = [
  { name: 'auth',         cwd: 'server/auth-service',         cmd: 'npm test' },
  { name: 'twin',         cwd: 'server/twin-service',         cmd: 'npm test' },
  { name: 'notification', cwd: 'server/notification-service', cmd: 'npm test' },
  { name: 'sensor',       cwd: 'server/sensor-service',       cmd: 'npm test' },
  { name: 'socket',       cwd: 'server/socket-service',       cmd: 'npm test' },
  { name: 'client',       cwd: 'client',                      cmd: 'npm run test:unit' },
  { name: 'agent',        cwd: 'server/agent-service',        cmd: 'uv run pytest tests/unit' },
];

// ── Parse arguments ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const parallel = args.includes('--parallel');
const target = args.find((a) => !a.startsWith('--')) ?? 'all';

const targets = target === 'all'
  ? SUITES
  : SUITES.filter((s) => s.name === target);

if (targets.length === 0) {
  console.error(`Unknown test target: "${target}"`);
  console.error(`Available: all, ${SUITES.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

// ── Runners ──────────────────────────────────────────────────────────────────

const banner = (suite) => `\n━━━ ${suite.name.padEnd(13)} (${suite.cwd}) ━━━\n`;

function runSequential() {
  let failed = [];
  for (const suite of targets) {
    process.stdout.write(banner(suite));
    const r = spawnSync(suite.cmd, { cwd: suite.cwd, stdio: 'inherit', shell: true });
    if (r.status !== 0) failed.push(suite.name);
  }
  return failed;
}

function runParallel() {
  return new Promise((resolve) => {
    let failed = [];
    let done = 0;

    targets.forEach((suite) => {
      const buffer = [];
      const child = spawn(suite.cmd, { cwd: suite.cwd, shell: true });

      child.stdout.on('data', (d) => buffer.push(d.toString()));
      child.stderr.on('data', (d) => buffer.push(d.toString()));

      child.on('close', (code) => {
        // Flush this suite's output in one block so parallel runs aren't interleaved
        process.stdout.write(banner(suite) + buffer.join(''));
        if (code !== 0) failed.push(suite.name);
        if (++done === targets.length) resolve(failed);
      });
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const start = Date.now();
const failed = parallel ? await runParallel() : runSequential();
const seconds = ((Date.now() - start) / 1000).toFixed(1);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (failed.length === 0) {
  console.log(`OK  -  ${targets.length} suite(s) passed in ${seconds}s`);
  process.exit(0);
} else {
  console.log(`FAIL  -  ${failed.length}/${targets.length} suite(s) failed (${seconds}s): ${failed.join(', ')}`);
  process.exit(1);
}
