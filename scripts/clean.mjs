/**
 * Full lockfile reset behind `just clean-install`. For every JS workspace it
 * wipes node_modules + package-lock.json, then regenerates the lockfile; for
 * every Python workspace it regenerates uv.lock. `just install` then installs
 * from the fresh locks.
 *
 * Lockfiles are regenerated with --cpu=x64 --os=linux so platform-specific
 * optional packages (e.g. @emnapi/* pulled in by mongodb-memory-server) resolve
 * for Linux — matching the CI runner — even when running on Windows or macOS.
 *
 * The workspace list comes from moon's project graph (see lib/workspaces.mjs),
 * so it stays in sync with .moon/workspace.yml. Cross-platform.
 */
import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTasks } from './lib/run.mjs';
import { queryWorkspaces } from './lib/workspaces.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { js, python } = queryWorkspaces();

// 1. Wipe node_modules + package-lock.json for every JS workspace.
for (const ws of js) {
  for (const name of ['node_modules', 'package-lock.json']) {
    const target = join(root, ws, name);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      console.log(`  ✓ removed ${ws}/${name}`);
    }
  }
}

// 2. Regenerate every lockfile from scratch, in parallel.
const tasks = [
  ...js.map((cwd) => ({
    name: cwd,
    cwd,
    cmd: 'npm install --package-lock-only --cpu=x64 --os=linux',
  })),
  ...python.map((cwd) => ({ name: `${cwd} (uv)`, cwd, cmd: 'uv lock' })),
];

await runTasks(tasks, { label: 'lock' });
