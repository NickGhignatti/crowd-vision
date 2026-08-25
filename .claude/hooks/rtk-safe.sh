#!/usr/bin/env bash
# PreToolUse(Bash): rtk output compaction, with rtk 0.44's two sharp edges blunted.
#
# 1. `-h` collision. rtk's own parser eats a short `-h`, so `grep -h pat file`
#    returns rtk's help text instead of the file's contents - plausible-looking
#    wrong output. Same for `ls -h`, `wc -l -h`.
# 2. Compound commands. rtk rewrites a chained line and stamps the whole thing
#    `permissionDecision: allow`, auto-approving the tail it never inspected.
#
# Either shape skips the rewrite and runs natively. Everything else goes to rtk.
set -uo pipefail

command -v rtk >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# -h anywhere in a short-flag cluster (-h, -rh, -hn), or a long --help.
if printf '%s' "$cmd" | grep -qE '(^|[[:space:]])-[A-Za-z]*h[A-Za-z]*([[:space:]]|$)|--help([[:space:]]|$)'; then
  exit 0
fi

# Anything that chains, pipes, substitutes or spans lines: rtk's "allow" would
# cover a command it never rewrote. Not worth the compaction.
case "$cmd" in
  *'&&'*|*'||'*|*';'*|*'|'*|*'$('*|*'`'*|*$'\n'*) exit 0 ;;
esac

printf '%s' "$input" | rtk hook claude
exit 0
