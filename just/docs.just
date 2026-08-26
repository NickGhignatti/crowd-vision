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
        echo "and re-check the theme in documentation/theme/crowdvision.css." >&2
        exit 1
    fi

[doc("Build the whole landing-page/ site: the guide at the root + the OpenAPI specs.")]
build: check-version
    sh scripts/check-docs-links.sh
    rm -rf landing-page
    quarkdown c documentation/main.qd --out landing-page/.stage --allow native-content
    cp -r landing-page/.stage/*/. landing-page/
    rm -rf landing-page/.stage
    cat documentation/theme/crowdvision.css >> landing-page/theme/theme.css
    mkdir -p landing-page/api
    cp api/index.html api/*.yaml landing-page/api/

[doc("Live-reloading preview server for the guide while editing.")]
preview:
    quarkdown c documentation/main.qd --out landing-page/.stage --allow native-content --preview --watch

# Builds the whole site, then live-serves
[doc("Build the site then live-serve the whole landing-page/ site at :8080.")]
serve: build
    mise exec -- npx --yes live-server landing-page
