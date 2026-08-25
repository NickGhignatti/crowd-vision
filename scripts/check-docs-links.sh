#!/bin/sh
# Guards the two ways content reaches the published site but nobody can get to it.
#
# 1. Both navigation lists are hand-maintained: the sidebar (documentation/_nav.qd)
#    and the API Reference page's spec table. Add a page or a spec without
#    touching them and the build still goes green -- the file publishes, and
#    nothing on the site links to it.
#
# 2. Quarkdown names each output directory after the page's FILENAME, and the
#    OpenAPI specs are copied in afterwards. A page named api.qd therefore builds
#    to <root>/api/ and is then overwritten by the specs -- silently, mid-build.
set -eu

cd "$(dirname "$0")/.."

nav='documentation/_nav.qd'
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
    grep -q "${page#documentation/}" "$nav" ||
        missing="${missing}
  missing from ${nav}: ${page}"

    if [ "$(basename "$page" .qd)" = "$specdir" ]; then
        missing="${missing}
  ${page} builds to <root>/${specdir}/, which the ${specdir}/ specs overwrite -- rename the file"
    fi
done

[ -z "$missing" ] && exit 0

printf 'docs: content would publish unreachable:%s\n' "$missing" >&2
exit 1
