// Installs dependencies for every package moon knows about, in parallel:
//   - `npm ci` for each JS (typescript|javascript) project (reproducible; never
//     rewrites the lockfile, so a Linux-resolved lock stays intact on Win/macOS)
//   - `uv sync --locked` for each Python project
//   - `cargo fetch` for each Rust project
//
// The package list comes from `moon query projects` (see lib/workspaces.mjs),
// so it can never drift from .moon/workspace.yml.
//
// To (re)generate lockfiles instead of installing from them, use
// `just setup clean-install` — that is the only path that mutates lock files.

import { runTasks } from './lib/run.mjs';
import { queryWorkspaces } from './lib/workspaces.mjs';

const { js, python, rust } = queryWorkspaces();

const tasks = [
  ...js.map((cwd) => ({ name: cwd, cwd, cmd: 'npm ci' })),
  ...python.map((cwd) => ({ name: `${cwd} (uv)`, cwd, cmd: 'uv sync --locked' })),
  ...rust.map((cwd) => ({ name: `${cwd} (cargo)`, cwd, cmd: 'cargo fetch' })),
];

await runTasks(tasks, { label: 'install' });
