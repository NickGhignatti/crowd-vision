#!/usr/bin/env python3
"""Aggregate per-service coverage reports into files for GitHub-native reporting.

Reads the coverage report each stack produces and emits:
  - badge.json          shields.io endpoint schema (overall weighted line coverage)
  - summary.json         {service: {lines, branches}} percentages, the PR-delta baseline
  - coverage-counts.json {service: {lines_covered, lines_total, branches_covered,
                          branches_total}} raw counts — internal only, not for display.

cd-coverage.yml only re-runs coverage for services whose files changed in this
push, so ARTIFACTS_ROOT may hold a subset of services. coverage-counts.json
from the previous run (BASELINE_COUNTS) is merged with the fresh subset before
recomputing badge.json/summary.json, so unchanged services keep their last
known numbers instead of dropping out of the report, and the overall badge
stays a true weighted average instead of one computed over only what ran.

Three input formats are supported:
  - istanbul   coverage-summary.json   (Jest + Vitest)                  .total.<metric>.{covered,total}
  - cobertura  coverage.xml            (pytest-cov; gocover-cobertura)  root @lines-covered/@lines-valid
  - llvmcov    coverage-summary.json   (cargo llvm-cov --json)          .data[0].totals.<metric>.{covered,count}

Usage:
    python scripts/coverage-summary.py [ARTIFACTS_ROOT] [OUT_DIR] [BASELINE_COUNTS]

ARTIFACTS_ROOT defaults to "coverage-artifacts" and is expected to contain one
sub-directory per service (named by its "key" in .github/services.json), each
holding that service's report file. OUT_DIR defaults to the current directory.
BASELINE_COUNTS optionally points at a previous run's coverage-counts.json;
omit it (or pass a non-existent path) on a full/first run.

The service list itself is read from .github/services.json — the same
registry cd-coverage.yml uses to build its per-language matrices — so this
stays in sync with whatever services actually produce a coverage report,
rather than a hand-maintained copy that drifts.

Stdlib only — runs anywhere Python 3.10+ is available.
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# language -> (format, report path relative to a service's artifact sub-directory),
# mirroring how each templates/<lang>/coverage-report.yml produces its report.
LANG_FORMATS: dict[str, tuple[str, str]] = {
    "node": ("istanbul", "coverage-summary.json"),
    "python": ("cobertura", "coverage.xml"),
    "rust": ("llvmcov", "coverage-summary.json"),
    "go": ("cobertura", "coverage.xml"),
}


def _load_services(registry_path: Path) -> dict[str, tuple[str, str]]:
    """service key -> (format, report filename), for every service cd-coverage.yml tracks."""
    registry = json.loads(registry_path.read_text())
    return {
        entry["key"]: LANG_FORMATS[entry["lang"]]
        for entry in registry
        if entry.get("lang") in LANG_FORMATS and entry.get("ci") is not False
    }


# (covered, total) per metric; metrics we keep in the summary
Counts = dict[str, tuple[int, int]]


def _istanbul(path: Path) -> Counts:
    total = json.loads(path.read_text())["total"]
    out: Counts = {}
    for metric in ("lines", "branches"):
        m = total[metric]
        out[metric] = (int(m["covered"]), int(m["total"]))
    return out


def _cobertura(path: Path) -> Counts:
    root = ET.parse(path).getroot()

    def pair(covered: str, valid: str) -> tuple[int, int]:
        return int(root.get(covered, 0)), int(root.get(valid, 0))

    return {
        "lines": pair("lines-covered", "lines-valid"),
        "branches": pair("branches-covered", "branches-valid"),
    }


def _llvmcov(path: Path) -> Counts:
    totals = json.loads(path.read_text())["data"][0]["totals"]
    out: Counts = {}
    for key, metric in (("lines", "lines"), ("branches", "branches")):
        m = totals[key]
        out[metric] = (int(m["covered"]), int(m["count"]))
    return out


PARSERS = {"istanbul": _istanbul, "cobertura": _cobertura, "llvmcov": _llvmcov}


def _pct(covered: int, total: int) -> float:
    return round(100 * covered / total, 2) if total else 0.0


def _color(pct: float) -> str:
    if pct >= 80:
        return "brightgreen"
    if pct >= 60:
        return "yellow"
    return "red"


CountsBySvc = dict[str, dict[str, int]]


def collect_counts(root: Path, services: dict[str, tuple[str, str]]) -> CountsBySvc:
    """Raw (covered, total) counts per service. Missing reports are warned and skipped."""
    fresh: CountsBySvc = {}
    for service, (fmt, rel) in services.items():
        report = root / service / rel
        if not report.exists():
            print(f"warning: no coverage report for {service} at {report}", file=sys.stderr)
            continue
        counts = PARSERS[fmt](report)
        fresh[service] = {
            "lines_covered": counts["lines"][0],
            "lines_total": counts["lines"][1],
            "branches_covered": counts["branches"][0],
            "branches_total": counts["branches"][1],
        }
    return fresh


def render(merged_counts: CountsBySvc) -> tuple[dict, dict]:
    """Turn merged raw counts into (badge, summary) display dicts."""
    summary: dict[str, dict[str, float]] = {}
    lines_covered = lines_total = 0

    for service, c in merged_counts.items():
        summary[service] = {
            "lines": _pct(c["lines_covered"], c["lines_total"]),
            "branches": _pct(c["branches_covered"], c["branches_total"]),
        }
        lines_covered += c["lines_covered"]
        lines_total += c["lines_total"]

    overall = _pct(lines_covered, lines_total)
    badge = {
        "schemaVersion": 1,
        "label": "coverage",
        "message": f"{overall:.1f}%",
        "color": _color(overall),
    }
    return badge, summary


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path("coverage-artifacts")
    out_dir = Path(argv[2]) if len(argv) > 2 else Path(".")
    baseline_path = Path(argv[3]) if len(argv) > 3 else None
    out_dir.mkdir(parents=True, exist_ok=True)

    services = _load_services(REPO_ROOT / ".github" / "services.json")
    fresh = collect_counts(root, services)

    merged: CountsBySvc = {}
    if baseline_path and baseline_path.exists():
        merged.update(json.loads(baseline_path.read_text()))
    merged.update(fresh)

    if not merged:
        print("error: no coverage reports found, refusing to write empty output", file=sys.stderr)
        return 1

    badge, summary = render(merged)
    (out_dir / "badge.json").write_text(json.dumps(badge))
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    (out_dir / "coverage-counts.json").write_text(json.dumps(merged, indent=2) + "\n")
    print(
        f"wrote badge.json ({badge['message']}) — {len(fresh)} services rerun, "
        f"{len(merged)} total in summary.json"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
