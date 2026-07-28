#!/usr/bin/env bash
# PreToolUse hook (Bash): hard-deny git commit / git push. User reviews and
# runs these themselves, always - no exception, even if explicitly asked.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

if printf '%s' "$cmd" | grep -qE '(^|[;&|]|\brtk\s+)\s*git\s+(commit|push)\b'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "git commit/push is user-only in this repo - the user reviews and runs these themselves. Stage/prepare changes, then hand off."
    }
  }'
fi
exit 0
