"""Run the golden dataset against a running agent-service.

Usage:
    # single run against the server's default model
    AGENT_URL=http://localhost/agent AUTH_COOKIE="authentication_token=..." \
        uv run python evals/run_evals.py

    # A/B several models in one go (per-request override) + comparison table
    uv run python evals/run_evals.py \
        --models openai/gpt-4o-mini,anthropic/claude-sonnet-4-6,google/gemini-2.5-flash

Assumes the corpus referenced in expected_sources has already been ingested.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
from dataclasses import dataclass

import httpx

HERE = pathlib.Path(__file__).parent


@dataclass
class RunStats:
    model: str  # "(default)" when no override was sent
    passed: int
    total: int
    cost_usd: float
    latency_ms: float


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


def run_dataset(
    client: httpx.Client,
    base: str,
    headers: dict,
    dataset: list[dict],
    model: str | None,
) -> RunStats:
    """Run every row once (optionally pinning a chat model) and print per-row results."""
    label = model or "(default)"
    passed = 0
    total = len(dataset)
    total_cost = 0.0
    total_latency_ms = 0.0

    print(f"\n=== model: {label} ===")
    for row in dataset:
        body = {"question": row["question"], "stream": False}
        if model:
            body["model"] = model
        t0 = time.perf_counter()
        try:
            r = client.post(f"{base}/ask", json=body, headers=headers)
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
        f"{label}: {passed}/{total} passed | "
        f"total cost ${total_cost:.4f} | "
        f"avg latency {total_latency_ms / max(total, 1):.0f}ms"
    )
    return RunStats(label, passed, total, total_cost, total_latency_ms / max(total, 1))


def print_comparison(stats: list[RunStats]) -> None:
    name_w = max((len(s.model) for s in stats), default=5)
    print("\n" + "=" * (name_w + 44))
    print(f"{'model':<{name_w}}  {'pass':>7}  {'pass%':>6}  {'cost $':>9}  {'avg ms':>8}")
    print("-" * (name_w + 44))
    for s in stats:
        pct = 100 * s.passed / max(s.total, 1)
        print(
            f"{s.model:<{name_w}}  {f'{s.passed}/{s.total}':>7}  {pct:>5.0f}%  "
            f"{s.cost_usd:>9.4f}  {s.latency_ms:>8.0f}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the golden dataset against agent-service.")
    parser.add_argument(
        "--models",
        default=os.environ.get("MODELS", ""),
        help="Comma-separated OpenRouter model ids to A/B. Empty ⇒ one run on the server default.",
    )
    args = parser.parse_args()

    base = os.environ.get("AGENT_URL", "http://localhost/agent").rstrip("/")
    cookie = os.environ.get("AUTH_COOKIE", "")
    dataset = load_dataset(HERE / "dataset.jsonl")
    headers = {"Cookie": cookie} if cookie else {}
    timeout = float(os.environ.get("EVAL_TIMEOUT_SECONDS", "120"))

    models: list[str | None] = [m.strip() for m in args.models.split(",") if m.strip()] or [None]

    results: list[RunStats] = []
    with httpx.Client(timeout=timeout) as client:
        for model in models:
            results.append(run_dataset(client, base, headers, dataset, model))

    if len(results) > 1:
        print_comparison(results)

    # Non-zero exit if any row failed in any run, so this can gate CI.
    return 0 if all(s.passed == s.total for s in results) else 1


if __name__ == "__main__":
    sys.exit(main())
