//
// Route managed-tool invocations through mise.
//
// `.mise.toml` at the repo root is the single source of truth for tool versions
// (node, npm, uv, cargo, moon). Wrapping a command in `mise exec -- <cmd>` makes
// its first token resolve from those pinned versions regardless of whether the
// caller's shell has mise activated — and because mise injects the tools onto
// PATH for the command *and every child it spawns*, a script launched this way
// passes mise's environment down to anything it shells out to.
//
// We skip the wrapper when we can already see a mise-provided environment. The
// Justfile launches these scripts under `mise exec`, which exports __MISE_DIFF;
// an activated shell exports MISE_SHELL. Detecting either keeps a command from
// being wrapped twice (harmless, but noisy) while still wrapping when a script
// is run directly (e.g. `node scripts/install.mjs`) on a host where mise was
// never activated — which is exactly the gap that let a bare `uv` call fail.
//

const insideMise = Boolean(process.env.__MISE_DIFF || process.env.MISE_SHELL);

// Prefix a shell command string so its tool resolves from mise. No-op when we
// are already running inside a mise-provided environment.
export function withMise(cmd) {
  return insideMise ? cmd : `mise exec -- ${cmd}`;
}
