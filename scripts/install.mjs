// Installs deps for every package moon knows about (npm ci / uv sync --locked / cargo
// fetch), reproducibly. Use `just setup clean-install` to regenerate lockfiles instead.

import { runTasks } from './lib/run.mjs';
import { queryWorkspaces } from './lib/workspaces.mjs';

const { js, python, rust } = queryWorkspaces();

const tasks = [
  ...js.map((cwd) => ({ name: cwd, cwd, cmd: 'npm ci' })),
  ...python.map((cwd) => ({ name: `${cwd} (uv)`, cwd, cmd: 'uv sync --locked' })),
  ...rust.map((cwd) => ({ name: `${cwd} (cargo)`, cwd, cmd: 'cargo fetch' })),
];

await runTasks(tasks, { label: 'install' });
