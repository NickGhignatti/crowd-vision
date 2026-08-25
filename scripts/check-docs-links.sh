#!/bin/sh
# Both lists the published site navigates by are hand-maintained: the portal's
# OpenAPI links (documentation/site/index.html) and each guide's _nav.qd. Add a
# spec or a page without touching them and the build still goes green -- the
# file publishes, and nothing on the site links to it. This turns that silent
# drift into a failed build.
set -eu

cd "$(dirname "$0")/.."

missing=''

for spec in api/*.yaml; do
    [ -e "$spec" ] || continue
    grep -q "spec=$(basename "$spec")" documentation/site/index.html ||
        missing="${missing}
  not linked from the portal: ${spec}"
done

for guide in user developer; do
    nav="documentation/${guide}/_nav.qd"
    for page in $(find "documentation/${guide}" -name '*.qd' ! -name 'main.qd' ! -name '_*.qd'); do
        grep -q "${page#documentation/${guide}/}" "$nav" ||
            missing="${missing}
  missing from ${nav}: ${page}"
    done
done

[ -z "$missing" ] && exit 0

printf 'docs: content would publish unreachable:%s\n' "$missing" >&2
exit 1
