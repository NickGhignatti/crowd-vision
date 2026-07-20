// Wraps a command in `mise exec --` so its tool resolves from .mise.toml's pinned
// versions, unless we're already inside a mise-provided environment (__MISE_DIFF/MISE_SHELL).

const insideMise = Boolean(process.env.__MISE_DIFF || process.env.MISE_SHELL);

// Prefix a shell command string so its tool resolves from mise. No-op when we
// are already running inside a mise-provided environment.
export function withMise(cmd) {
  return insideMise ? cmd : `mise exec -- ${cmd}`;
}
