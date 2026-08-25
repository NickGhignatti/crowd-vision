#!/usr/bin/env bash
# PostToolUse(Write|Edit): format the touched file with this repo's own formatter.
# Silent no-op when the tool is missing. Never blocks the edit, never touches logic.
set -uo pipefail

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -z "$f" ] && exit 0
[ -f "$f" ] || exit 0

case "$f" in
  */target/*|*/node_modules/*|*/.venv/*|*/.moon/cache/*) exit 0 ;;
esac

dir=$(dirname "$f")

# Tools go through mise (repo rule), with a plain-PATH fallback for hosts without it.
run() {
  local bin="$1"; shift
  if command -v mise >/dev/null 2>&1 && (cd "$dir" && mise exec -- "$bin" "$@" >/dev/null 2>&1); then
    return 0
  fi
  command -v "$bin" >/dev/null 2>&1 && "$bin" "$@" >/dev/null 2>&1
}

# Walk up from the file for a locally installed binary (ruff, prettier).
find_up() {
  local d="$1" rel="$2"
  while [ "$d" != "/" ]; do
    [ -x "$d/$rel" ] && { printf '%s' "$d/$rel"; return 0; }
    d=$(dirname "$d")
  done
  return 1
}

case "$f" in
  *.go)
    run gofmt -w "$f"
    ;;
  *.rs)
    run rustfmt --edition 2024 "$f"
    ;;
  *.py)
    ruff=$(find_up "$dir" ".venv/bin/ruff") && "$ruff" format "$f" >/dev/null 2>&1
    ;;
  *.ts|*.tsx|*.vue|*.js|*.mjs|*.cjs|*.json|*.css|*.html)
    prettier=$(find_up "$dir" "node_modules/.bin/prettier") && "$prettier" --write "$f" >/dev/null 2>&1
    ;;
esac
exit 0
