#!/usr/bin/env bash
# `cargo test --tests` (plural) is Cargo's "every test-flagged target" — it
# would rerun the crate's unit tests too. Naming each tests/*.rs binary
# explicitly keeps this to integration tests only. Run with the target
# service's own directory as cwd; extra args (e.g. --release) pass straight
# through to `cargo test`. Shared by CI (tpl-rust-ci.yml) and any service's
# local integration-test container, so there is one copy of this logic.
set -euo pipefail

shopt -s nullglob
files=(tests/*.rs)
shopt -u nullglob

if [ "${#files[@]}" -eq 0 ]; then
  echo "no integration tests in tests/, skipping"
  exit 0
fi

args=("$@")
for f in "${files[@]}"; do
  args+=(--test "$(basename "$f" .rs)")
done

cargo test "${args[@]}"
