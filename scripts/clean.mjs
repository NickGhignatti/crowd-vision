/**
 * Cross-platform wipe of every JS workspace's node_modules and package-lock.json.
 * Called by `just clean-install`. Works on Windows, macOS, and Linux.
 */
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const workspaces = [
  'tooling',
  'tooling/eslint-config',
  'client',
  'server/auth-service',
  'server/twin-service',
  'server/notification-service',
  'server/sensor-service',
  'server/socket-service',
  'server/tests',
  'simulators/sensor-simulator',
];

for (const ws of workspaces) {
  const modules = join(root, ws, 'node_modules');
  const lockfile = join(root, ws, 'package-lock.json');

  if (existsSync(modules)) {
    rmSync(modules, { recursive: true, force: true });
    console.log(`  ✓ removed ${ws}/node_modules`);
  }

  if (existsSync(lockfile)) {
    rmSync(lockfile, { force: true });
    console.log(`  ✓ removed ${ws}/package-lock.json`);
  }
}

console.log('\nAll JS workspaces cleaned.');
