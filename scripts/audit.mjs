// Mirrors .github/workflows/ci-audit.yml in order to reproduce the CI security
// gate locally before pushing. Runs in parallel:
//   - `npm audit --audit-level=high --omit=dev` for each CI JS workspace
//   - `uv audit` for the Python agent-service
//   - `cargo audit` for the Rust contracts-service (optional: skipped with a hint
//     if cargo-audit isn't installed — CI uses the rustsec advisory action)
//
// Exits non-zero if any audit reports a vulnerability, matching CI.
//

import { runTasks } from './lib/run.mjs';
import { CI_JS_WORKSPACES, PYTHON_WORKSPACE, RUST_WORKSPACE } from './lib/workspaces.mjs';

const tasks = [
  ...CI_JS_WORKSPACES.map((cwd) => ({
    name: cwd,
    cwd,
    cmd: 'npm audit --audit-level=high --omit=dev',
  })),
  { name: 'agent-service (uv)', cwd: PYTHON_WORKSPACE, cmd: 'uv audit' },
  { name: 'contracts-service (cargo)', cwd: RUST_WORKSPACE, cmd: 'cargo audit', optional: true },
];

await runTasks(tasks, { label: 'audit' });
