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
    answer = (response.get("answer") or "").lower()
    idk = bool(response.get("idk"))
    decision = response.get("decision", "answerable")
    citations = response.get("citations") or []

    if row.get("expected_idk"):
        return idk, "expected IDK"
    if row.get("expected_decision"):
        return decision == row["expected_decision"], f"expected decision={row['expected_decision']}"

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

    with httpx.Client(timeout=60.0) as client:
        for row in dataset:
            t0 = time.perf_counter()
            r = client.post(
                f"{base}/ask",
                json={"question": row["question"], "stream": False},
                headers=headers,
            )
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
