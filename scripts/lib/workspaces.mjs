// Derives install.mjs/clean.mjs's workspaces from `moon query projects` so the package
// list can't drift from .moon/workspace.yml. Paths returned are repo-root-relative.

import { execSync } from 'node:child_process';

import { withMise } from './mise.mjs';

export function queryWorkspaces() {
  const out = execSync(withMise('moon query projects'), { encoding: 'utf8' });
  const { projects } = JSON.parse(out);

  const js = [];
  const python = [];
  const rust = [];
  const go = [];
  for (const { source, language } of projects) {
    if (language === 'typescript' || language === 'javascript') js.push(source);
    else if (language === 'python') python.push(source);
    else if (language === 'rust') rust.push(source);
    else if (language === 'go') go.push(source);
  }

  return { js: js.sort(), python: python.sort(), rust: rust.sort(), go: go.sort() };
}
