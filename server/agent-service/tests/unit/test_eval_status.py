"""Unit tests for the eval runner's status classification + xfail accounting.

`run_evals.py` lives in evals/ (run as a script, not an importable package), so we
load it by path via importlib. These tests need no server/DB/LLM.
"""

import importlib.util
import pathlib
import sys

import httpx
import pytest

_EVALS = pathlib.Path(__file__).resolve().parents[2] / "evals" / "run_evals.py"
_spec = importlib.util.spec_from_file_location("run_evals", _EVALS)
assert _spec and _spec.loader
run_evals = importlib.util.module_from_spec(_spec)
# Register before exec so @dataclass can resolve cls.__module__ via sys.modules.
sys.modules["run_evals"] = run_evals
_spec.loader.exec_module(run_evals)


# ── classify(): PASS / FAIL / XFAIL / XPASS ──────────────────────────────────


def test_pass_without_marker():
    assert run_evals.classify({}, infra_error=False, score_ok=True) == "PASS"


def test_assertion_failure_without_marker_is_fail():
    assert run_evals.classify({}, infra_error=False, score_ok=False) == "FAIL"


def test_assertion_failure_on_xfail_row_is_xfail():
    assert run_evals.classify({"xfail": True}, infra_error=False, score_ok=False) == "XFAIL"


def test_pass_on_xfail_row_is_xpass():
    assert run_evals.classify({"xfail": True}, infra_error=False, score_ok=True) == "XPASS"


def test_infra_error_always_fails_even_for_xfail_row():
    # The crux: an outage / 401 / 500 must never be masked as an accepted gap.
    assert run_evals.classify({"xfail": True}, infra_error=True, score_ok=False) == "FAIL"
    assert run_evals.classify({"xfail": True}, infra_error=True, score_ok=True) == "FAIL"


# ── load_dataset(): xfail rows must carry a reason ───────────────────────────


def test_load_dataset_rejects_xfail_without_reason(tmp_path):
    p = tmp_path / "dataset.json"
    p.write_text('[{"id": "x", "question": "q", "xfail": true}]')
    with pytest.raises(SystemExit, match="xfail_reason"):
        run_evals.load_dataset(p)


def test_load_dataset_accepts_xfail_with_reason(tmp_path):
    p = tmp_path / "dataset.json"
    p.write_text('[{"id": "x", "question": "q", "xfail": true, "xfail_reason": "tracked gap"}]')
    rows = run_evals.load_dataset(p)
    assert rows[0]["id"] == "x"


def test_load_dataset_rejects_non_array_json(tmp_path):
    p = tmp_path / "dataset.json"
    p.write_text('{"id": "x", "question": "q"}')
    with pytest.raises(SystemExit, match="JSON array of objects"):
        run_evals.load_dataset(p)


def test_load_dataset_reports_invalid_json(tmp_path):
    p = tmp_path / "dataset.json"
    p.write_text("[")
    with pytest.raises(SystemExit, match="contains invalid JSON"):
        run_evals.load_dataset(p)


# ── run_dataset(): accounting and row-level infra failures ───────────────────


def _auth():
    return run_evals.EvalAuth(
        "authentication_token", "admin", "unibo.it", explicit_cookie="authentication_token=test"
    )


def test_run_dataset_records_invalid_json_as_fail_even_for_xfail(capsys):
    row = {
        "id": "x",
        "question": "q",
        "xfail": True,
        "xfail_reason": "tracked gap",
    }
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text="not json"))

    with httpx.Client(transport=transport) as client:
        stats = run_evals.run_dataset(client, "http://agent", _auth(), [row], None)

    assert stats.failed == 1
    assert stats.xfailed == 0
    assert "[FAIL] x: invalid JSON response" in capsys.readouterr().out


def test_run_dataset_records_non_object_json_as_fail():
    row = {"id": "x", "question": "q"}
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=[]))

    with httpx.Client(transport=transport) as client:
        stats = run_evals.run_dataset(client, "http://agent", _auth(), [row], None)

    assert stats.failed == 1


def test_run_dataset_counts_xpass_as_behavioral_pass():
    row = {
        "id": "x",
        "question": "q",
        "xfail": True,
        "xfail_reason": "tracked gap",
    }
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={}))

    with httpx.Client(transport=transport) as client:
        stats = run_evals.run_dataset(client, "http://agent", _auth(), [row], None)

    assert stats.passed == 1
    assert stats.xpassed == 1


# ── exit_code(): the headline behaviour (`just eval` no longer "fails") ───────


def _stats(*, passed=16, total=16, xfailed=0, xpassed=0, failed=0):
    return run_evals.RunStats("m", passed, total, 0.0, 0.0, xfailed, xpassed, failed)


def test_clean_run_exits_zero():
    assert run_evals.exit_code([_stats(passed=16)], strict=False) == 0


def test_known_gap_only_exits_zero():
    # passing run with one accepted xfail (e.g. cv-oos-001) must NOT fail the run
    assert run_evals.exit_code([_stats(passed=15, xfailed=1)], strict=False) == 0


def test_unexpected_failure_exits_one():
    assert run_evals.exit_code([_stats(passed=15, failed=1)], strict=False) == 1


def test_xpass_is_tolerated_without_strict():
    assert run_evals.exit_code([_stats(passed=16, xpassed=1)], strict=False) == 0


def test_xpass_fails_under_strict():
    assert run_evals.exit_code([_stats(passed=16, xpassed=1)], strict=True) == 1


def test_strict_still_tolerates_xfail():
    assert run_evals.exit_code([_stats(passed=15, xfailed=1)], strict=True) == 0


def test_report_only_tolerates_unexpected_failures():
    assert run_evals.exit_code([_stats(passed=15, failed=1)], strict=False, report_only=True) == 0


def test_report_only_tolerates_strict_xpass():
    assert run_evals.exit_code([_stats(passed=16, xpassed=1)], strict=True, report_only=True) == 0
