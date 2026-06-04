//
// Single source of truth for the repo's workspace layout.
//
// There is no root package.json / npm workspaces — each JS package owns its own
// node_modules and package-lock.json (see the Contributing docs). These lists are
// shared by install.mjs, audit.mjs, deps-check.mjs and clean.mjs so the set of
// directories never drifts between recipes.
//

// Every JS package that has its own package-lock.json. Used by `just install`
// and `just clean-install` (bootstrap + full wipe/regenerate).
export const JS_WORKSPACES = [
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

// The JS dirs that CI's audit/deps matrices cover (.github/workflows/ci-audit.yml,
// ci-deps.yml). A subset of JS_WORKSPACES — excludes the `file:`-linked
// eslint-config and the integration-only `server/tests`. `just audit` and
// `just deps-check` use this so they mirror CI exactly.
export const CI_JS_WORKSPACES = [
  'tooling',
  'client',
  'server/auth-service',
  'server/twin-service',
  'server/notification-service',
  'server/sensor-service',
  'server/socket-service',
  'simulators/sensor-simulator',
];

// The Python (uv) and Rust (cargo) packages, for the non-JS legs of each recipe.
export const PYTHON_WORKSPACE = 'server/agent-service';
export const RUST_WORKSPACE = 'server/contracts-service';
