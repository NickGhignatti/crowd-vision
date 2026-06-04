// Installs dependencies for every language in parallel:
//   - `npm ci` for each JS workspace (reproducible; never rewrites the lockfile,
//     so a Linux-resolved lock stays intact when installing on Windows/macOS)
//   - `uv sync --locked` for the Python agent-service
//   - `cargo fetch` for the Rust contracts-service
//
// To (re)generate lockfiles instead of installing from them, use
// `just clean-install` — that is the only path that mutates lock files.

import { runTasks } from './lib/run.mjs';
import { JS_WORKSPACES, PYTHON_WORKSPACE, RUST_WORKSPACE } from './lib/workspaces.mjs';

const tasks = [
  ...JS_WORKSPACES.map((cwd) => ({ name: cwd, cwd, cmd: 'npm ci' })),
  { name: 'agent-service (uv)', cwd: PYTHON_WORKSPACE, cmd: 'uv sync --locked' },
  { name: 'contracts-service (cargo)', cwd: RUST_WORKSPACE, cmd: 'cargo fetch' },
];

await runTasks(tasks, { label: 'install' });
