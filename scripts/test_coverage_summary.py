#!/usr/bin/env python3
"""Self-check for coverage-summary.py's merge behavior. Run directly: python3 scripts/test_coverage_summary.py"""

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import importlib.util

spec = importlib.util.spec_from_file_location(
    "coverage_summary", Path(__file__).resolve().parent / "coverage-summary.py"
)
coverage_summary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coverage_summary)


def test_render_computes_percentages_and_weighted_overall():
    counts = {
        "twin": {
            "lines_covered": 80,
            "lines_total": 100,
            "branches_covered": 40,
            "branches_total": 50,
        },
        "sensor": {
            "lines_covered": 10,
            "lines_total": 100,
            "branches_covered": 5,
            "branches_total": 50,
        },
    }
    badge, summary = coverage_summary.render(counts)
    assert summary["twin"]["lines"] == 80.0
    assert summary["sensor"]["lines"] == 10.0
    assert badge["message"] == "45.0%", badge  # (80 + 10) / (100 + 100)


def test_unchanged_service_survives_a_merge_with_a_partial_fresh_run():
    baseline = {
        "twin": {
            "lines_covered": 80,
            "lines_total": 100,
            "branches_covered": 40,
            "branches_total": 50,
        }
    }
    fresh = {
        "sensor": {
            "lines_covered": 50,
            "lines_total": 50,
            "branches_covered": 10,
            "branches_total": 10,
        }
    }
    merged, dropped = coverage_summary.merge_baseline(baseline, fresh, {"twin", "sensor"})
    badge, summary = coverage_summary.render(merged)
    assert "twin" in summary, "unchanged service must not drop out of the report"
    assert summary["twin"]["lines"] == 80.0
    assert summary["sensor"]["lines"] == 100.0
    assert dropped == []
    assert badge["message"] == "86.7%", badge  # (80 + 50) / (100 + 50)


def test_service_missing_from_the_registry_is_pruned_from_the_baseline():
    """A renamed service leaves its old key in the baseline forever otherwise, and
    both keys get weighed into the badge."""
    baseline = {
        "telemetry": {
            "lines_covered": 90,
            "lines_total": 100,
            "branches_covered": 0,
            "branches_total": 0,
        },
        # the pre-rename name of the same service, no longer in services.json
        "sensor": {
            "lines_covered": 10,
            "lines_total": 100,
            "branches_covered": 0,
            "branches_total": 0,
        },
    }
    merged, dropped = coverage_summary.merge_baseline(baseline, {}, {"telemetry"})

    assert dropped == ["sensor"]
    assert "sensor" not in merged, "a key absent from the registry must not survive the merge"
    badge, summary = coverage_summary.render(merged)
    assert "sensor" not in summary
    assert badge["message"] == "90.0%", badge  # not 50.0% — the dead key no longer dilutes it


def test_a_fresh_run_still_wins_over_the_baseline():
    baseline = {
        "twin": {
            "lines_covered": 10,
            "lines_total": 100,
            "branches_covered": 0,
            "branches_total": 0,
        }
    }
    fresh = {
        "twin": {
            "lines_covered": 75,
            "lines_total": 100,
            "branches_covered": 0,
            "branches_total": 0,
        }
    }
    merged, _ = coverage_summary.merge_baseline(baseline, fresh, {"twin"})
    assert merged["twin"]["lines_covered"] == 75, "the rerun result must replace the baseline"


def _repo_with(*relative_paths: str) -> Path:
    """A throwaway repo root holding empty files at the given paths."""
    repo_root = Path(tempfile.mkdtemp())
    for relative_path in relative_paths:
        file_path = repo_root / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("")
    return repo_root


def test_uncovered_ranges_join_lines_with_nothing_instrumented_between():
    # 12 is blank (not instrumented), so 10-14 is one gap; 15 ran, so 16 starts a new one
    hits_by_line = {10: 0, 11: 0, 13: 0, 14: 0, 15: 3, 16: 0}
    assert coverage_summary.uncovered_ranges(hits_by_line) == [[10, 14], [16, 16]]


def test_uncovered_ranges_of_a_fully_covered_file_are_empty():
    assert coverage_summary.uncovered_ranges({1: 1, 2: 5}) == []


def test_lcov_is_read_per_file_with_line_hits_and_branches():
    lcov = "\n".join([
        "TN:",
        "SF:/home/runner/work/crowd-vision/crowd-vision/backend/chat/src/lib.rs",
        "DA:1,4",
        "DA:2,0",
        "DA:3,0",
        "BRDA:2,0,0,1",
        "BRDA:2,0,1,-",
        "LF:3",
        "LH:1",
        "end_of_record",
        "SF:src/utils/math.ts",
        "DA:5,1",
        "end_of_record",
    ])
    files = coverage_summary.parse_lcov(lcov)
    chat_lib = files["/home/runner/work/crowd-vision/crowd-vision/backend/chat/src/lib.rs"]
    assert chat_lib["lines"] == {1: 4, 2: 0, 3: 0}
    assert chat_lib["branches"] == (1, 2), "a '-' branch was never reached: counted, not covered"
    assert files["src/utils/math.ts"]["lines"] == {5: 1}


def test_cobertura_is_read_per_file_and_merges_classes_of_the_same_file():
    xml = """<?xml version="1.0" ?>
<coverage lines-valid="4" lines-covered="2">
  <sources><source>/home/runner/work/crowd-vision/crowd-vision/backend/tenancy</source></sources>
  <packages><package name="api"><classes>
    <class name="handler" filename="internal/api/handler.go">
      <lines>
        <line number="10" hits="1"/>
        <line number="11" hits="0" branch="true" condition-coverage="50% (1/2)"/>
      </lines>
    </class>
    <class name="handler2" filename="internal/api/handler.go">
      <lines><line number="20" hits="0"/><line number="10" hits="2"/></lines>
    </class>
  </classes></package></packages>
</coverage>"""
    sources, files = coverage_summary.parse_cobertura_files(xml)
    assert sources == ["/home/runner/work/crowd-vision/crowd-vision/backend/tenancy"]
    handler = files["internal/api/handler.go"]
    assert handler["lines"] == {10: 2, 11: 0, 20: 0}, "the same line in two classes keeps its highest hit count"
    assert handler["branches"] == (1, 2)


def test_report_paths_become_repo_relative_whatever_form_the_tool_wrote():
    repo_root = _repo_with(
        "backend/chat/src/lib.rs",
        "frontend/src/utils/math.ts",
        "backend/tenancy/internal/api/handler.go",
    )
    to_repo_path = coverage_summary.to_repo_path
    # absolute, from a CI runner whose checkout lives elsewhere
    assert to_repo_path(
        "/home/runner/work/crowd-vision/crowd-vision/backend/chat/src/lib.rs", "backend/chat", repo_root
    ) == "backend/chat/src/lib.rs"
    # relative to the service directory
    assert to_repo_path("src/utils/math.ts", "frontend", repo_root) == "frontend/src/utils/math.ts"
    # a Go import path, module name first
    assert to_repo_path(
        "github.com/nickghignatti/crowd-vision/backend/tenancy/internal/api/handler.go",
        "backend/tenancy",
        repo_root,
    ) == "backend/tenancy/internal/api/handler.go"
    assert to_repo_path("does/not/exist.rs", "backend/chat", repo_root) is None


def test_service_report_lists_only_its_own_files_worst_first():
    repo_root = _repo_with(
        "backend/chat/src/lib.rs",
        "backend/chat/src/domain/conversation.rs",
        "schemas/claims-schema/src/lib.rs",
    )
    lcov = "\n".join([
        "SF:/ci/backend/chat/src/lib.rs", "DA:1,1", "DA:2,1", "end_of_record",
        "SF:/ci/backend/chat/src/domain/conversation.rs", "DA:1,0", "DA:2,0", "DA:3,1", "end_of_record",
        # a shared crate compiled into chat's tests: it has its own row on the page
        "SF:/ci/schemas/claims-schema/src/lib.rs", "DA:1,0", "end_of_record",
    ])
    artifact_dir = Path(tempfile.mkdtemp())
    (artifact_dir / "lcov.info").write_text(lcov)

    report = coverage_summary.build_service_report(
        "chat", "rust", artifact_dir, "backend/chat", repo_root, "abc1234"
    )

    assert report["service"] == "chat"
    assert report["tool"] == "cargo-llvm-cov"
    assert report["commit"] == "abc1234"
    assert [file["path"] for file in report["files"]] == [
        "backend/chat/src/domain/conversation.rs",  # 2 lines missing
        "backend/chat/src/lib.rs",  # none missing
    ]
    conversation = report["files"][0]
    assert (conversation["lines_covered"], conversation["lines_total"]) == (1, 3)
    assert conversation["uncovered"] == [[1, 2]]


def test_a_service_with_no_detailed_report_gets_no_report():
    artifact_dir = Path(tempfile.mkdtemp())
    (artifact_dir / "coverage-summary.json").write_text("{}")
    assert coverage_summary.build_service_report(
        "chat", "rust", artifact_dir, "backend/chat", _repo_with(), "abc1234"
    ) is None


def test_writing_reports_keeps_unchanged_services_and_drops_unknown_ones():
    reports_dir = Path(tempfile.mkdtemp())
    (reports_dir / "twin.json").write_text('{"service": "twin", "files": []}')
    (reports_dir / "sensor.json").write_text('{"service": "sensor", "files": []}')

    coverage_summary.write_reports(
        reports_dir, {"chat": {"service": "chat", "files": []}}, {"twin", "chat"}
    )

    assert sorted(path.name for path in reports_dir.iterdir()) == ["chat.json", "twin.json"]


if __name__ == "__main__":
    test_render_computes_percentages_and_weighted_overall()
    test_unchanged_service_survives_a_merge_with_a_partial_fresh_run()
    test_service_missing_from_the_registry_is_pruned_from_the_baseline()
    test_a_fresh_run_still_wins_over_the_baseline()
    test_uncovered_ranges_join_lines_with_nothing_instrumented_between()
    test_uncovered_ranges_of_a_fully_covered_file_are_empty()
    test_lcov_is_read_per_file_with_line_hits_and_branches()
    test_cobertura_is_read_per_file_and_merges_classes_of_the_same_file()
    test_report_paths_become_repo_relative_whatever_form_the_tool_wrote()
    test_service_report_lists_only_its_own_files_worst_first()
    test_a_service_with_no_detailed_report_gets_no_report()
    test_writing_reports_keeps_unchanged_services_and_drops_unknown_ones()
    print("ok")
