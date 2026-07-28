#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): nudge, not block. Fires only on files that
# signal a structural/architecture change (routing config, service topology,
# a brand-new go.mod/Cargo.toml/package.json). Reminds to sync CLAUDE.md and
# documentation/*.qd in the same change - graphify itself re-syncs
# automatically via the git post-commit hook, no manual step needed there.
set -uo pipefail

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
[ -z "$f" ] && exit 0

base=$(basename "$f")
signal=""

case "$f" in
  */Caddyfile|*/docker-compose*.yml|*/.moon/workspace.yml|*/k8s/*.yml|*/k8s/*.yaml)
    signal="routing/topology config changed"
    ;;
esac

if [ -z "$signal" ] && [ "$tool" = "Write" ]; then
  case "$base" in
    go.mod|Cargo.toml|package.json)
      signal="new project manifest created (possible new service)"
      ;;
  esac
fi

[ -z "$signal" ] && exit 0

jq -n --arg s "$signal" --arg f "$f" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Architecture-signal file changed (\($s)): \($f). Before finishing: update CLAUDE.md (Repository shape / Architecture / Commands section, whichever applies) and the matching documentation/developer/*.qd page. graphify re-extraction is automatic via the git post-commit hook - no manual step needed there.")
  }
}'
exit 0
