set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list docs

# Requires the Quarkdown CLI + a JDK 17+ on PATH: https://github.com/iamgio/quarkdown
[doc("Compile the Quarkdown guides + reports to landing-page/{user,dev,reports} (mirrors CI).")]
build:
    quarkdown c documentation/user/main.qd --out landing-page/user
    quarkdown c documentation/developer/main.qd --out landing-page/dev
    quarkdown c documentation/reports/spe/main.qd --out landing-page/reports
    quarkdown c documentation/reports/asw/main.qd --out landing-page/reports --allow global-read

# Renders each report to a downloadable PDF next to its HTML build.
[doc("Render SPE + ASW reports to landing-page/reports/*.pdf (headless Chrome via Node).")]
pdf:
    mise exec -- quarkdown c documentation/reports/spe/main.qd --out landing-page/reports --pdf --pdf-no-sandbox --timeout 120
    mise exec -- quarkdown c documentation/reports/asw/main.qd --out landing-page/reports --pdf --pdf-no-sandbox --timeout 120 --allow global-read

[doc("Live-reloading preview server for one guide. dir=user|developer (default: user).")]
preview dir="user":
    quarkdown c documentation/{{dir}}/main.qd --out landing-page/{{dir}} --preview --watch

# Builds both guides, then live-serves
[doc("Build both guides then live-serve the whole landing-page/ site at :8080.")]
serve: build
    mise exec -- npx --yes live-server landing-page
