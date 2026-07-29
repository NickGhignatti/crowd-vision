#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): auto-format the touched file with the
# project's own per-language formatter. Silent no-op when the tool/config
# isn't present for that file - never blocks the edit, never touches logic.
set -uo pipefail

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -z "$f" ] && exit 0
[ -f "$f" ] || exit 0

find_up() {
  # find_up <start-dir> <relative-bin-path>
  local dir="$1" rel="$2"
  while [ "$dir" != "/" ]; do
    if [ -x "$dir/$rel" ]; then printf '%s' "$dir/$rel"; return 0; fi
    dir=$(dirname "$dir")
  done
  return 1
}

case "$f" in
  *.go)
    command -v gofmt >/dev/null 2>&1 && gofmt -w "$f" 2>/dev/null
    ;;
  *.rs)
    command -v rustfmt >/dev/null 2>&1 && rustfmt --edition 2024 "$f" 2>/dev/null
    ;;
  *.py)
    ruff=$(find_up "$(dirname "$f")" ".venv/bin/ruff") && "$ruff" format "$f" 2>/dev/null
    ;;
  *.ts|*.tsx|*.vue|*.js|*.mjs|*.cjs|*.json)
    prettier=$(find_up "$(dirname "$f")" "node_modules/.bin/prettier") && "$prettier" --write "$f" 2>/dev/null
    ;;
esac
exit 0
