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
import re
import sys
from pathlib import Path

import yaml

REGISTRY = Path(".github/services.json")
GATE = Path(".github/workflows/ci-gate.yml")
WORKFLOWS = Path(".github/workflows")
FILTER_ACTION = Path(".github/actions/filter-services/action.yml")


def duplicate_filter_keys() -> list[str]:
    """The filter file `filter-services` builds exists only at runtime, so nothing in the
    repo can be parsed to check it. It concatenates one block per services.json entry with
    the gate's `extra_filters`, and dorny/paths-filter parses the result with js-yaml,
    which rejects a duplicated mapping key outright. That kills the `changes` job in
    seconds, every downstream job skips, and `ci-passed` fails having tested nothing.

    PyYAML would not find this: it accepts duplicate keys and silently keeps the last one.
    So the keys are counted textually, exactly as they are emitted.
    """
    lines: list[str] = []
    for service in json.loads(REGISTRY.read_text()):
        lines += [f"{service['key']}:", f'  - "{service["dir"]}/**"']

    steps = yaml.safe_load(GATE.read_text())["jobs"]["changes"]["steps"]
    extra = next(
        (
            step.get("with", {}).get("extra_filters", "")
            for step in steps
            if str(step.get("uses", "")).startswith("./.github/actions/filter-services")
        ),
        "",
    )
    lines += extra.splitlines()

    seen: dict[str, list[int]] = {}
    for number, line in enumerate(lines, 1):
        match = re.fullmatch(r"([A-Za-z0-9_.-]+):\s*", line)
        if match:
            seen.setdefault(match.group(1), []).append(number)

    return [
        f"filter '{key}' is declared twice (lines {', '.join(map(str, at))}) in the file "
        f"{FILTER_ACTION} composes — every {REGISTRY} key already becomes a filter of the "
        f"same name, so naming it in extra_filters too makes the whole file unparseable"
        for key, at in sorted(seen.items())
        if len(at) > 1
    ]


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

    problems: list[str] = dangling_needs() + duplicate_filter_keys()

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
            f"{GATE}, listed in both 'docker.needs' and 'ci-passed.needs', and must not be "
            f"repeated in that job's 'extra_filters'.",
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
