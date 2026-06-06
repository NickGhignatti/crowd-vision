//
// Single source of truth for the repo's package list is moon's project graph
// (.moon/workspace.yml). Instead of maintaining a parallel hand-written list
// that can silently drift, install.mjs and clean.mjs derive their workspaces
// from `moon query projects`. Adding a package is then a one-place change:
// register it with moon.
//
//   js     → typescript | javascript projects  (npm)
//   python → python projects                   (uv)
//   rust   → rust projects                      (cargo)
//
// Paths returned are repo-root-relative (moon's `source`), e.g. "server/auth-service".
//

import { execSync } from 'node:child_process';

import { withMise } from './mise.mjs';

export function queryWorkspaces() {
  const out = execSync(withMise('moon query projects'), { encoding: 'utf8' });
  const { projects } = JSON.parse(out);

  const js = [];
  const python = [];
  const rust = [];
  for (const { source, language } of projects) {
    if (language === 'typescript' || language === 'javascript') js.push(source);
    else if (language === 'python') python.push(source);
    else if (language === 'rust') rust.push(source);
  }

  return { js: js.sort(), python: python.sort(), rust: rust.sort() };
}
