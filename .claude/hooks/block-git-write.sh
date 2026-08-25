#!/usr/bin/env bash
# PreToolUse(Bash): hard-deny git commit / git push. The user runs these
# themselves, always - no exception, even when explicitly asked.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

git_write='git(\s+(-C\s+\S+|-c\s+\S+|--no-pager|--git-dir=\S+|--work-tree=\S+))*\s+(commit|push)\b'

if printf '%s' "$cmd" | grep -qE "(^|[;&|(]|\`|\\\$\()\s*(sudo\s+|env\s+\S+=\S+\s+|xargs\s+|rtk\s+\S*\s*)*$git_write"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "git commit/push is user-only in this repo. Stage or prepare the change, then hand off - do not retry, do not work around this."
    }
  }'
fi
exit 0
