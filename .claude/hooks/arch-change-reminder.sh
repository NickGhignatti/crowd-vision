#!/usr/bin/env bash
# PostToolUse(Write|Edit): nudge, never block. Fires only on files that signal a
# structural change, and says which CLAUDE.md and which .qd page must move with it.
set -uo pipefail

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
[ -z "$f" ] && exit 0

signal=""
todo=""

case "$f" in
  */Caddyfile|*/k8s/*.yml|*/k8s/*.yaml)
    signal="edge routing / mesh topology changed"
    todo="Caddyfile and k8s must stay at routing+auth parity. Update root CLAUDE.md (Architecture invariants > Routing) and documentation/developer/architecture/{overview,deployment,service-mesh}.qd."
    ;;
  */docker-compose*.yml)
    signal="compose topology changed"
    todo="Update documentation/developer/config/docker-compose.qd, and root CLAUDE.md if a service, port or dependency appeared or vanished."
    ;;
  */.moon/workspace.yml|*/.github/services.json)
    signal="package registry changed"
    todo="A package must be registered in BOTH .moon/workspace.yml and .github/services.json. Update root CLAUDE.md (Repository shape) and documentation/developer/config/toolchain.qd."
    ;;
  */schemas/fixtures/*.json|*/schemas/json/*.json|*/schemas/*/src/*.rs)
    signal="cross-service contract changed"
    todo="Fixture, JSON Schema and every language's parser move together. Run the Go, Rust and Python conformance tests, then update schemas/CLAUDE.md and documentation/developer/packages/*.qd."
    ;;
  *.cedar|*.cedarschema|*/auth-policy/fixtures/*.json)
    signal="shared authorization policy changed"
    todo="Cedar rules are replayed by Go, Rust and Python. Add the case to fixtures/conformance.json, run all three replays, update backend/libs/auth-policy/CLAUDE.md and documentation/developer/packages/auth-policy.qd."
    ;;
  */tests/architecture*.rs|*/tests/architecture_fitness.rs)
    signal="a service's layering rules changed"
    todo="The fitness test IS that service's layering contract. Update that service's CLAUDE.md (Layout) to match."
    ;;
esac

if [ -z "$signal" ] && [ "$tool" = "Write" ]; then
  case "$(basename "$f")" in
    go.mod|Cargo.toml|package.json|pyproject.toml)
      signal="new project manifest created"
      todo="If this is a new package: register it in .moon/workspace.yml and .github/services.json, add its row to root CLAUDE.md (Repository shape), and add a documentation/developer/services/*.qd page."
      ;;
  esac
fi

[ -z "$signal" ] && exit 0

jq -n --arg s "$signal" --arg f "$f" --arg t "$todo" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("Structural change (\($s)): \($f). Docs move in the same change, not after — \($t)")
  }
}'
exit 0
