#!/usr/bin/env python3
"""Aggregate per-service coverage reports into two files for GitHub-native reporting.

Reads the coverage report each stack produces and emits:
  - badge.json   shields.io endpoint schema (overall weighted line coverage)
  - summary.json {service: {lines, branches}} percentages, the PR-delta baseline

Three input formats are supported:
  - istanbul   coverage-summary.json   (Jest + Vitest)        .total.<metric>.{covered,total}
  - cobertura  coverage.xml            (pytest-cov)           root @lines-covered/@lines-valid
  - llvmcov    coverage.json           (cargo llvm-cov --json) .data[0].totals.<metric>.{covered,count}

Usage:
    python scripts/coverage-summary.py [ARTIFACTS_ROOT] [OUT_DIR]

ARTIFACTS_ROOT defaults to "coverage-artifacts" and is expected to contain one
sub-directory per service (named by the short key in SERVICES below), each
holding that service's report file. OUT_DIR defaults to the current directory.

Stdlib only — runs anywhere Python 3.10+ is available.
"""

from __future__ import annotations

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# service key -> (format, report path relative to its artifact sub-directory)
SERVICES: dict[str, tuple[str, str]] = {
    "chat": ("istanbul", "coverage-summary.json"),
    "notification": ("istanbul", "coverage-summary.json"),
    "sensor": ("istanbul", "coverage-summary.json"),
    "socket": ("istanbul", "coverage-summary.json"),
    "twin": ("istanbul", "coverage-summary.json"),
    "client": ("istanbul", "coverage-summary.json"),
    "agent": ("cobertura", "coverage.xml"),
    "contracts": ("llvmcov", "coverage.json"),
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


def aggregate(root: Path) -> tuple[dict, dict]:
    """Return (badge, summary) dicts. Missing reports are warned and skipped."""
    summary: dict[str, dict[str, float]] = {}
    lines_covered = lines_total = 0

    for service, (fmt, rel) in SERVICES.items():
        report = root / service / rel
        if not report.exists():
            print(f"warning: no coverage report for {service} at {report}", file=sys.stderr)
            continue
        counts = PARSERS[fmt](report)
        summary[service] = {metric: _pct(c, t) for metric, (c, t) in counts.items()}
        c, t = counts["lines"]
        lines_covered += c
        lines_total += t

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
    out_dir.mkdir(parents=True, exist_ok=True)

    badge, summary = aggregate(root)
    if not summary:
        print("error: no coverage reports found, refusing to write empty output", file=sys.stderr)
        return 1

    (out_dir / "badge.json").write_text(json.dumps(badge))
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(f"wrote badge.json ({badge['message']}) and summary.json for {len(summary)} services")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
