set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list docs

# Requires the Quarkdown CLI + a JDK 17+ on PATH: https://github.com/iamgio/quarkdown
# landing-page/ is 100% generated — nothing in it is tracked. CI runs this exact
# recipe, so the OpenAPI specs cannot drift out of the published site the way
# duplicated workflow steps would.
#
# Quarkdown always writes into <out>/<docname>/, but the guide IS the site here —
# so it builds into a staging dir and its contents are lifted to the root.
# The skin styles Quarkdown's generated DOM (page-margin-*, .box > header,
# .codespan-content, pre.mermaid). A version bump can rename those without
# failing the build, so drift is caught here rather than on the published site.
[private]
check-version:
    #!/usr/bin/env bash
    set -euo pipefail
    pinned=$(sed -n 's/^QUARKDOWN_VERSION = "\(.*\)"$/\1/p' .mise.toml)
    have=$(quarkdown --version | awk '{print $NF}')
    if [ "$have" != "$pinned" ]; then
        echo "quarkdown $have installed, but .mise.toml pins $pinned." >&2
        echo "Install the pinned build, or change QUARKDOWN_VERSION in .mise.toml" >&2
        echo "and re-check documentation/style/quarkdown.css and scripts/quarkdown-dom.js." >&2
        exit 1
    fi

# Quarkdown's DOM stays behind one stylesheet and one script, so a version bump
# touches two files instead of every component.
[private]
check-layers:
    #!/usr/bin/env bash
    set -euo pipefail
    leaks=$(grep -rlE 'body\.quarkdown|\.quarkdown-docs|data-role=' documentation/components documentation/scripts documentation/style/tokens.css --exclude=quarkdown-dom.js || true)
    if [ -n "$leaks" ]; then
        echo "Quarkdown DOM named outside style/quarkdown.css and scripts/quarkdown-dom.js:" >&2
        echo "$leaks" >&2
        exit 1
    fi

[doc("Build the whole landing-page/ site: the guide at the root + the OpenAPI specs.")]
build: check-version check-layers
    sh scripts/check-docs-links.sh
    rm -rf landing-page
    quarkdown c documentation/main.qd --out landing-page/.stage --allow native-content --strict
    cp -r landing-page/.stage/*/. landing-page/
    rm -rf landing-page/.stage
    cat documentation/style/tokens.css documentation/style/quarkdown.css >> landing-page/theme/theme.css
    cat documentation/scripts/quarkdown-dom.js documentation/scripts/nav-collapse.js documentation/scripts/table-scroll.js documentation/scripts/toc-spy.js > landing-page/theme/ambitwin.js
    python3 scripts/docs-meta.py landing-page/theme/page-meta.json
    mkdir -p landing-page/api
    cp api/index.html api/asyncapi.html api/*.yaml landing-page/api/

[doc("Live-reloading preview server for the guide while editing.")]
preview:
    quarkdown c documentation/main.qd --out landing-page/.stage --allow native-content --preview --watch

# Builds the whole site, then live-serves
[doc("Build the site then live-serve the whole landing-page/ site at :8080.")]
serve: build
    mise exec -- npx --yes live-server landing-page
