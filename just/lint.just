set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

# Bare `just lint` lists recipes.
[private]
default:
    @just --list lint

[doc("Lint every service (moon caches results; unchanged services are instant).")]
all:
    mise exec -- moon run :lint

[doc("Lint only services affected by changes on the current branch.")]
affected:
    mise exec -- moon run :lint --affected

[doc("Fix linting issues across every service (always runs; not cached).")]
fix:
    mise exec -- moon run :lint-fix
