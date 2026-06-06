"""Run the evals dataset against a running agent-service.

Usage:
    AGENT_URL=http://localhost/agent AUTH_COOKIE="token=..." \
        uv run python evals/run_evals.py

Assumes the corpus referenced in expected_source has already been ingested.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import time

import httpx

HERE = pathlib.Path(__file__).parent


def load_dataset(path: pathlib.Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def score_row(row: dict, response: dict) -> tuple[bool, str]:
    """Grade one golden-dataset row against the agent's JSON response.

    Checks, in order: expected_idk → tool behaviour (expected_tool /
    expected_no_tool) → retrieval grounding (expected_sources) → answer content
    (expected_keywords) → must_cite. Fields are optional, so a row only asserts
    what it specifies (live-data rows assert a tool but no keywords; doc rows
    assert a source + keywords; conversational rows assert no tool).
    """
    answer = (response.get("answer") or "").lower()
    idk = bool(response.get("idk"))
    decision = response.get("decision", "answered")
    citations = response.get("citations") or []
    tool_calls = [
        tc.get("name") for tc in (response.get("retrieval") or {}).get("tool_calls", [])
    ]
    sources = [c.get("source", "") for c in citations]

    if row.get("expected_idk"):
        return idk, "expected IDK" if idk else "expected IDK but agent answered"
    if row.get("expected_decision"):
        ok = decision == row["expected_decision"]
        return ok, f"expected decision={row['expected_decision']}, got {decision}"

    # Tool behaviour.
    if row.get("expected_no_tool") and tool_calls:
        return False, f"expected no tool call, but called: {tool_calls}"
    if row.get("expected_tool") and row["expected_tool"] not in tool_calls:
        return False, f"expected tool '{row['expected_tool']}' not called (called: {tool_calls})"

    # Retrieval grounding: at least one citation source must match an expected source
    # (substring, so repo-relative paths can be given without the chunk suffix).
    expected_sources = row.get("expected_sources") or (
        [row["expected_source"]] if row.get("expected_source") else []
    )
    if expected_sources and not any(exp in s for exp in expected_sources for s in sources):
        return False, f"no citation from expected sources {expected_sources} (got {sources})"

    # Answer content.
    missing = [kw for kw in row.get("expected_keywords", []) if kw.lower() not in answer]
    if missing:
        return False, f"missing keywords: {missing}"

    if row.get("must_cite") and not citations:
        return False, "no citations"

    return True, "ok"


def main() -> int:
    base = os.environ.get("AGENT_URL", "http://localhost/agent").rstrip("/")
    cookie = os.environ.get("AUTH_COOKIE", "")
    dataset = load_dataset(HERE / "dataset.jsonl")

    passed = 0
    total = len(dataset)
    total_cost = 0.0
    total_latency_ms = 0.0

    headers = {"Cookie": cookie} if cookie else {}
    timeout = float(os.environ.get("EVAL_TIMEOUT_SECONDS", "120"))

    with httpx.Client(timeout=timeout) as client:
        for row in dataset:
            t0 = time.perf_counter()
            try:
                r = client.post(
                    f"{base}/ask",
                    json={"question": row["question"], "stream": False},
                    headers=headers,
                )
            except httpx.HTTPError as e:
                # A slow/failed row shouldn't abort the whole run.
                latency_ms = (time.perf_counter() - t0) * 1000
                total_latency_ms += latency_ms
                print(f"[FAIL] {row['id']} ({latency_ms:.0f}ms): request error: {e!r}")
                continue
            latency_ms = (time.perf_counter() - t0) * 1000
            total_latency_ms += latency_ms
            if r.status_code != 200:
                print(f"[FAIL] {row['id']}: HTTP {r.status_code}: {r.text[:200]}")
                continue
            data = r.json()
            total_cost += data.get("usage", {}).get("cost_usd", 0.0)
            ok, reason = score_row(row, data)
            status = "PASS" if ok else "FAIL"
            print(
                f"[{status}] {row['id']} ({latency_ms:.0f}ms) "
                f"${data.get('usage', {}).get('cost_usd', 0):.5f}: {reason}"
            )
            if ok:
                passed += 1

    print(
        f"\n{passed}/{total} passed | "
        f"total cost ${total_cost:.4f} | "
        f"avg latency {total_latency_ms / max(total, 1):.0f}ms"
    )
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
