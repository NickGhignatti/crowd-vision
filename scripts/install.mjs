// Installs deps for every package moon knows about (npm ci / uv sync --locked / cargo
// fetch / go mod download), reproducibly. Use `just setup clean-install` to regenerate
// lockfiles instead.

import { runTasks } from './lib/run.mjs';
import { queryWorkspaces } from './lib/workspaces.mjs';

const { js, python, rust, go } = queryWorkspaces();

const tasks = [
  ...js.map((cwd) => ({ name: cwd, cwd, cmd: 'npm ci' })),
  ...python.map((cwd) => ({ name: `${cwd} (uv)`, cwd, cmd: 'uv sync --locked' })),
  ...rust.map((cwd) => ({ name: `${cwd} (cargo)`, cwd, cmd: 'cargo fetch' })),
  ...go.map((cwd) => ({ name: `${cwd} (go)`, cwd, cmd: 'go mod download' })),
];

await runTasks(tasks, { label: 'install' });
