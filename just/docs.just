set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list docs

# Requires the Quarkdown CLI + a JDK 17+ on PATH: https://github.com/iamgio/quarkdown
# landing-page/ is 100% generated — nothing in it is tracked. CI runs this exact
# recipe, so the static half (portal + OpenAPI specs) cannot drift out of the
# published site the way duplicated workflow steps would.
[doc("Build the whole landing-page/ site: Quarkdown guides + portal + OpenAPI specs.")]
build:
    sh scripts/check-docs-links.sh
    quarkdown c documentation/user/main.qd --out landing-page/user
    quarkdown c documentation/developer/main.qd --out landing-page/dev
    mkdir -p landing-page/api
    cp documentation/site/index.html landing-page/index.html
    cp api/index.html api/*.yaml landing-page/api/

[doc("Live-reloading preview server for one guide. dir=user|developer (default: user).")]
preview dir="user":
    quarkdown c documentation/{{dir}}/main.qd --out landing-page/{{dir}} --preview --watch

# Builds the whole site, then live-serves
[doc("Build the site then live-serve the whole landing-page/ site at :8080.")]
serve: build
    mise exec -- npx --yes live-server landing-page
