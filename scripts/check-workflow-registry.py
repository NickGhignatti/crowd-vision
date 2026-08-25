#!/usr/bin/env python3
"""Fail when the workflows and .github/services.json disagree, or when a job waits on nothing.

`needs:` cannot be an expression in GitHub Actions, so ci-gate.yml has to spell out
every service job by name three times: once as the job, once in `docker.needs`, and
once in `ci-passed.needs`. A service missing from either list still gets its own job,
but nothing waits for it — the gate goes green while that service is untested. This
checks the three lists against the registry instead of trusting them to stay in sync.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

REGISTRY = Path(".github/services.json")
GATE = Path(".github/workflows/ci-gate.yml")
WORKFLOWS = Path(".github/workflows")


def dangling_needs() -> list[str]:
    """A `needs:` naming a job that does not exist makes GitHub reject the whole
    workflow before any job starts - the run fails in 0s with no logs, and every
    check inside that file (including this one) never executes. Renaming a service
    is how it happens, so the check has to run outside CI too."""
    problems: list[str] = []
    for workflow in sorted(WORKFLOWS.glob("*.yml")):
        try:
            doc = yaml.safe_load(workflow.read_text()) or {}
        except yaml.YAMLError as error:
            problems.append(f"{workflow} is not valid YAML: {error}")
            continue
        jobs = doc.get("jobs") or {}
        for name, job in jobs.items():
            needs = job.get("needs") or []
            if isinstance(needs, str):
                needs = [needs]
            problems += [
                f"{workflow} job '{name}' needs '{need}', which is not a job in that file"
                for need in needs
                if need not in jobs
            ]
            uses = job.get("uses")
            if isinstance(uses, str) and uses.startswith("./") and not Path(uses[2:]).exists():
                problems.append(f"{workflow} job '{name}' uses '{uses}', which does not exist")
    return problems


def main() -> int:
    services = {s["key"] for s in json.loads(REGISTRY.read_text()) if s.get("ci") is not False}
    gate = yaml.safe_load(GATE.read_text())
    jobs = gate["jobs"]

    problems: list[str] = dangling_needs()

    missing_jobs = sorted(services - set(jobs))
    if missing_jobs:
        problems.append(f"{GATE} has no job for: {', '.join(missing_jobs)}")

    for gating_job in ("docker", "ci-passed"):
        declared = set(jobs[gating_job].get("needs", []))
        missing = sorted((services & set(jobs)) - declared)
        if missing:
            problems.append(f"{GATE} job '{gating_job}' does not wait for: {', '.join(missing)}")

    for problem in problems:
        print(f"::error::{problem}", file=sys.stderr)
    if problems:
        print(
            f"\n{len(problems)} inconsistency(ies). Every service in {REGISTRY} needs a job in "
            f"{GATE}, listed in both 'docker.needs' and 'ci-passed.needs'.",
            file=sys.stderr,
        )
        return 1

    workflows = len(list(WORKFLOWS.glob("*.yml")))
    print(
        f"ok: {len(services)} services consistent across {REGISTRY} and {GATE}; "
        f"{workflows} workflows have no dangling needs/uses"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
