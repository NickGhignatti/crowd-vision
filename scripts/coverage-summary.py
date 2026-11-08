#!/usr/bin/env python3
"""Aggregate per-service coverage reports into files for GitHub-native reporting.

Reads the coverage report each stack produces and emits:
  - badge.json          shields.io endpoint schema (overall weighted line coverage)
  - summary.json         {service: {lines, branches}} percentages, the PR-delta baseline
  - coverage-counts.json {service: {lines_covered, lines_total, branches_covered,
                          branches_total}} raw counts — internal only, not for display.
  - reports/<service>.json  per-file lines, branches and never-run line ranges, read
                          from each tool's line-level report (lcov.info or coverage.xml);
                          the coverage page opens it when a service row is clicked.
                          Reports of services that did not rerun are kept as they are.

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
import os
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


# language -> (line-level report file, tool name shown on the page). Go and Python
# reuse their cobertura xml, which already carries every line's hit count.
DETAIL_FORMATS: dict[str, tuple[str, str]] = {
    "rust": ("lcov.info", "cargo-llvm-cov"),
    "node": ("lcov.info", "vitest (v8)"),
    "python": ("coverage.xml", "pytest-cov"),
    "go": ("coverage.xml", "go test -cover, via gocover-cobertura"),
}

# one source file: {"lines": {line: hits}, "branches": (covered, total)}
FileCoverage = dict[str, object]


def parse_lcov(text: str) -> dict[str, FileCoverage]:
    """Line hits and branch counts per file, keyed by the path the tool wrote."""
    files: dict[str, FileCoverage] = {}
    current_path: str | None = None
    hits_by_line: dict[int, int] = {}
    branches_covered = branches_total = 0

    for raw_line in text.splitlines():
        record = raw_line.strip()
        if record.startswith("SF:"):
            current_path = record[3:]
            hits_by_line, branches_covered, branches_total = {}, 0, 0
        elif record.startswith("DA:") and current_path is not None:
            line_number, hits = (int(value) for value in record[3:].split(",")[:2])
            hits_by_line[line_number] = max(hits_by_line.get(line_number, 0), hits)
        elif record.startswith("BRDA:") and current_path is not None:
            taken = record[5:].split(",")[3]
            branches_total += 1
            # "-" means the block holding the branch never ran
            if taken != "-" and int(taken) > 0:
                branches_covered += 1
        elif record == "end_of_record" and current_path is not None:
            files[current_path] = {
                "lines": hits_by_line,
                "branches": (branches_covered, branches_total),
            }
            current_path = None
    return files


def parse_cobertura_files(xml_text: str) -> tuple[list[str], dict[str, FileCoverage]]:
    """(source roots, per-file coverage). One file may span several classes."""
    root = ET.fromstring(xml_text)
    sources = [source.text.strip() for source in root.iter("source") if source.text]
    files: dict[str, FileCoverage] = {}

    for class_element in root.iter("class"):
        filename = class_element.get("filename")
        if not filename:
            continue
        entry = files.setdefault(filename, {"lines": {}, "branches": (0, 0)})
        hits_by_line: dict[int, int] = entry["lines"]
        branches_covered, branches_total = entry["branches"]
        for line_element in class_element.iter("line"):
            line_number = int(line_element.get("number", 0))
            hits = int(line_element.get("hits", 0))
            hits_by_line[line_number] = max(hits_by_line.get(line_number, 0), hits)
            condition = line_element.get("condition-coverage", "")
            # "50% (1/2)": the counts sit in the brackets
            if "(" in condition:
                covered, total = condition.split("(")[1].rstrip(")").split("/")
                branches_covered += int(covered)
                branches_total += int(total)
        entry["branches"] = (branches_covered, branches_total)
    return sources, files


def to_repo_path(
    tool_path: str, service_dir: str, repo_root: Path, sources: list[str] | tuple[str, ...] = ()
) -> str | None:
    """The repo-relative path of a file a coverage tool named, or None if it is not in the repo.

    Tools write absolute runner paths, paths relative to the service, or Go import
    paths; trying ever shorter tails of the path covers all three without knowing which.
    """
    candidates = [tool_path] + [f"{source.rstrip('/')}/{tool_path}" for source in sources]
    for candidate in candidates:
        parts = [part for part in Path(candidate).parts if part != "/"]
        for start in range(len(parts)):
            tail = Path(*parts[start:])
            if (repo_root / service_dir / tail).is_file():
                return (Path(service_dir) / tail).as_posix()
            if (repo_root / tail).is_file():
                return tail.as_posix()
    return None


def uncovered_ranges(hits_by_line: dict[int, int]) -> list[list[int]]:
    """[[first, last], ...] of lines never run. A gap holds until a line that did run."""
    ranges: list[list[int]] = []
    open_range: list[int] | None = None
    for line_number in sorted(hits_by_line):
        if hits_by_line[line_number] > 0:
            open_range = None
        elif open_range is None:
            open_range = [line_number, line_number]
            ranges.append(open_range)
        else:
            open_range[1] = line_number
    return ranges


def build_service_report(
    service: str, language: str, artifact_dir: Path, service_dir: str, repo_root: Path, commit: str
) -> dict | None:
    """Per-file coverage of one service, worst file first, or None without a line-level report."""
    filename, tool = DETAIL_FORMATS[language]
    report_path = artifact_dir / filename
    if not report_path.exists():
        return None

    text = report_path.read_text()
    if filename == "lcov.info":
        sources, files = [], parse_lcov(text)
    else:
        sources, files = parse_cobertura_files(text)

    service_prefix = service_dir.rstrip("/") + "/"
    rows = []
    for tool_path, coverage in files.items():
        repo_path = to_repo_path(tool_path, service_dir, repo_root, sources)
        # a shared crate or library compiled into this service's tests has its own row
        if repo_path is None or not repo_path.startswith(service_prefix):
            continue
        hits_by_line: dict[int, int] = coverage["lines"]
        branches_covered, branches_total = coverage["branches"]
        rows.append({
            "path": repo_path,
            "lines_covered": sum(1 for hits in hits_by_line.values() if hits > 0),
            "lines_total": len(hits_by_line),
            "branches_covered": branches_covered,
            "branches_total": branches_total,
            "uncovered": uncovered_ranges(hits_by_line),
        })

    rows.sort(key=lambda row: (-(row["lines_total"] - row["lines_covered"]), row["path"]))
    return {"service": service, "tool": tool, "commit": commit, "files": rows}


def write_reports(reports_dir: Path, fresh_reports: dict[str, dict], known: set[str]) -> None:
    """Write this run's reports over the previous ones; drop services the registry no longer lists."""
    reports_dir.mkdir(parents=True, exist_ok=True)
    for stale in reports_dir.glob("*.json"):
        if stale.stem not in known:
            stale.unlink()
    for service, report in fresh_reports.items():
        (reports_dir / f"{service}.json").write_text(json.dumps(report, separators=(",", ":")) + "\n")


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


def merge_baseline(
    baseline: CountsBySvc, fresh: CountsBySvc, known: set[str]
) -> tuple[CountsBySvc, list[str]]:
    """Carry unchanged services forward, minus any the registry no longer lists.

    The baseline is merged forward on every run, so without this a renamed or
    deleted service keeps its last numbers indefinitely - and is weighed into the
    overall alongside whatever replaced it, dragging the badge toward the dead
    entry's old score. Pruning against the registry is what stops `sensor` and
    `telemetry`, or `contracts` and `dashboard`, both counting.
    """
    dropped = sorted(set(baseline) - known)
    merged = {key: counts for key, counts in baseline.items() if key in known}
    merged.update(fresh)
    return merged, dropped


def main(argv: list[str]) -> int:
    root = Path(argv[1]) if len(argv) > 1 else Path("coverage-artifacts")
    out_dir = Path(argv[2]) if len(argv) > 2 else Path(".")
    baseline_path = Path(argv[3]) if len(argv) > 3 else None
    out_dir.mkdir(parents=True, exist_ok=True)

    services = _load_services(REPO_ROOT / ".github" / "services.json")
    fresh = collect_counts(root, services)

    baseline: CountsBySvc = {}
    if baseline_path and baseline_path.exists():
        baseline = json.loads(baseline_path.read_text())
    merged, dropped = merge_baseline(baseline, fresh, set(services))
    if dropped:
        print(
            f"pruned {len(dropped)} service(s) absent from .github/services.json: "
            f"{', '.join(dropped)}",
            file=sys.stderr,
        )

    if not merged:
        print("error: no coverage reports found, refusing to write empty output", file=sys.stderr)
        return 1

    registry = json.loads((REPO_ROOT / ".github" / "services.json").read_text())
    commit = os.environ.get("GITHUB_SHA", "HEAD")
    fresh_reports = {}
    for entry in registry:
        service, language = entry["key"], entry.get("lang")
        if service not in fresh or language not in DETAIL_FORMATS:
            continue
        report = build_service_report(
            service, language, root / service, entry["dir"], REPO_ROOT, commit
        )
        if report is None:
            print(f"warning: no line-level report for {service}", file=sys.stderr)
            continue
        fresh_reports[service] = report
    write_reports(out_dir / "reports", fresh_reports, set(services))

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
