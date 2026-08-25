set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list lint

[doc("Lint every service (moon caches results; unchanged services are instant).")]
all: workflows
    mise exec -- moon run :lint

[doc("Lint only services affected by changes on the current branch.")]
affected: workflows
    mise exec -- moon run :lint --affected

# ci-gate.yml runs this too, but a workflow with a dangling `needs:` is rejected by
# GitHub before any job starts - so the check has to exist outside CI as well, or the
# only symptom is a run that fails in 0s with no logs.
[doc("Check the workflows against .github/services.json and for dangling needs/uses.")]
workflows:
    mise exec -- python3 scripts/check-workflow-registry.py

[doc("Fix linting issues across every service (always runs; not cached).")]
fix:
    mise exec -- moon run :lint-fix
