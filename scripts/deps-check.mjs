// Mirrors .github/workflows/ci-deps.yml in order to confirm every lockfile is in
// sync with its manifest before pushing (the check that was failing twin-service
// in CI). Runs in parallel:
//   - `npm ci` for each CI JS workspace (fails if package.json <-> lock drift)
//   - `uv sync --locked` for the Python agent-service
//   - `cargo check` for the Rust contracts-service
//
// Exits non-zero if any lockfile is out of sync, matching CI.

import { runTasks } from './lib/run.mjs';
import { CI_JS_WORKSPACES, PYTHON_WORKSPACE, RUST_WORKSPACE } from './lib/workspaces.mjs';

const tasks = [
  ...CI_JS_WORKSPACES.map((cwd) => ({ name: cwd, cwd, cmd: 'npm ci' })),
  { name: 'agent-service (uv)', cwd: PYTHON_WORKSPACE, cmd: 'uv sync --locked' },
  { name: 'contracts-service (cargo)', cwd: RUST_WORKSPACE, cmd: 'cargo check' },
];

await runTasks(tasks, { label: 'deps-check' });
