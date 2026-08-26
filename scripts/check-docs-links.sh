#!/bin/sh
# Guards the two ways content reaches the published site but nobody can get to it.
#
# 1. Every navigation list is hand-maintained: the sidebar (documentation/_nav.qd),
#    the top nav (documentation/_setup.qd) and the API Reference page's spec
#    table. Add a page or a spec without touching them and the build still goes
#    green -- the file publishes, and nothing on the site links to it.
#
#    A page needs to appear in exactly one of the two navigations, not both:
#    reference/ pages are deliberately kept out of the sidebar and reached from
#    the top nav instead.
#
# 2. Quarkdown names each output directory after the page's FILENAME, and the
#    OpenAPI specs are copied in afterwards. A page named api.qd therefore builds
#    to <root>/api/ and is then overwritten by the specs -- silently, mid-build.
set -eu

cd "$(dirname "$0")/.."

nav='documentation/_nav.qd'
navbar='documentation/_setup.qd'
apiref='documentation/reference/api-reference.qd'
specdir='api'
missing=''

for spec in "$specdir"/*.yaml; do
    [ -e "$spec" ] || continue
    grep -q "spec=$(basename "$spec")" "$apiref" ||
        missing="${missing}
  not linked from ${apiref}: ${spec}"
done

for page in $(find documentation -name '*.qd' ! -name 'main.qd' ! -name '_*.qd'); do
    rel="${page#documentation/}"
    if ! grep -q "$rel" "$nav" && ! grep -q "$rel" "$navbar"; then
        missing="${missing}
  linked from neither ${nav} (sidebar) nor ${navbar} (top nav): ${page}"
    fi

    if [ "$(basename "$page" .qd)" = "$specdir" ]; then
        missing="${missing}
  ${page} builds to <root>/${specdir}/, which the ${specdir}/ specs overwrite -- rename the file"
    fi
done

[ -z "$missing" ] && exit 0

printf 'docs: content would publish unreachable:%s\n' "$missing" >&2
exit 1
