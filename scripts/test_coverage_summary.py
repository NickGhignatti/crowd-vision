#!/usr/bin/env python3
"""Self-check for coverage-summary.py's merge behavior. Run directly: python3 scripts/test_coverage_summary.py"""

import sys
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
    merged = {**baseline, **fresh}
    badge, summary = coverage_summary.render(merged)
    assert "twin" in summary, "unchanged service must not drop out of the report"
    assert summary["twin"]["lines"] == 80.0
    assert summary["sensor"]["lines"] == 100.0
    assert badge["message"] == "86.7%", badge  # (80 + 50) / (100 + 50)


if __name__ == "__main__":
    test_render_computes_percentages_and_weighted_overall()
    test_unchanged_service_survives_a_merge_with_a_partial_fresh_run()
    print("ok")
