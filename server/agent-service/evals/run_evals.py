"""Run the golden dataset against a running agent-service.

Usage:
    # local run: automatically mints a fresh JWT for every request
    uv run python evals/run_evals.py

    # A/B several models in one go (per-request override) + comparison table
    uv run python evals/run_evals.py \
        --models openai/gpt-4o-mini,anthropic/claude-sonnet-4-6,google/gemini-2.5-flash

    # remote/CI run: provide a cookie explicitly
    AGENT_URL=https://example.com/agent AUTH_COOKIE="authentication_token=..." \
        uv run python evals/run_evals.py

Assumes the corpus referenced in expected_sources has already been ingested.

Exit code: 0 unless a row FAILs unexpectedly. A dataset row marked `"xfail": true`
(with a required `xfail_reason`) is an accepted, tracked gap: when it fails its
assertions it's reported as XFAIL and does NOT fail the run; if it ever passes it's
reported as XPASS (stale marker). Infra errors (request exceptions, non-200, malformed
responses) always FAIL, even on xfail rows. Pass --strict to also fail on XPASS (for CI
on a pinned model). Pass --report-only for an interactive report that exits zero after
scored results; setup and preflight errors still exit non-zero.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shlex
import sys
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
import jwt

HERE = pathlib.Path(__file__).parent
REPO_ROOT = HERE.parents[2]
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "agent-service", "host.docker.internal"}


def _read_env_value(path: pathlib.Path, name: str) -> str | None:
    """Read one simple dotenv assignment, including export/quotes/comments."""
    if not path.exists():
        return None
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        key, separator, value = line.partition("=")
        if not separator or key.strip() != name:
            continue
        value = value.strip()
        lexer = shlex.shlex(value, posix=True)
        lexer.whitespace_split = True
        lexer.commenters = "#"
        try:
            return " ".join(lexer)
        except ValueError as exc:
            raise SystemExit(f"Invalid {name} assignment in {path}: {exc}") from exc
    return None


def _jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET") or _read_env_value(REPO_ROOT / ".env", "JWT_SECRET")
    if not secret:
        raise SystemExit(
            "No JWT secret for local evaluation: set JWT_SECRET or define JWT_SECRET in "
            f"{REPO_ROOT / '.env'}"
        )
    return secret


def _is_local_url(url: str) -> bool:
    return urlparse(url).hostname in LOCAL_HOSTS


@dataclass
class EvalAuth:
    cookie_name: str
    role: str
    domain: str
    secret: str | None = None
    explicit_cookie: str | None = None

    @classmethod
    def from_args(cls, base: str, args: argparse.Namespace) -> EvalAuth:
        explicit_cookie = os.environ.get("AUTH_COOKIE")
        if explicit_cookie:
            return cls(args.cookie_name, args.role, args.domain, explicit_cookie=explicit_cookie)
        if not _is_local_url(base):
            raise SystemExit(
                "Automatic JWT minting is restricted to local agent URLs. "
                "Set AUTH_COOKIE when evaluating a remote service."
            )
        return cls(args.cookie_name, args.role, args.domain, secret=_jwt_secret())

    def headers(self) -> dict[str, str]:
        if self.explicit_cookie:
            return {"Cookie": self.explicit_cookie}
        assert self.secret is not None
        now = int(time.time())
        token = jwt.encode(
            {
                "sub": "evalbot",
                "roles": [self.role],
                "domains": [self.domain],
                "iat": now,
                "exp": now + 300,
            },
            self.secret,
            algorithm="HS256",
        )
        return {"Cookie": f"{self.cookie_name}={token}"}


@dataclass
class RunStats:
    model: str  # "(default)" when no override was sent
    passed: int
    total: int
    cost_usd: float
    latency_ms: float
    xfailed: int = 0  # known-gap rows that failed as expected
    xpassed: int = 0  # known-gap rows that now PASS → stale marker
    failed: int = 0  # unexpected failures (assertion or infra)


def load_dataset(path: pathlib.Path) -> list[dict]:
    try:
        rows = json.loads(path.read_text())
    except ValueError as exc:
        raise SystemExit(f"dataset {path} contains invalid JSON: {exc}") from exc
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise SystemExit(f"dataset {path} must be a JSON array of objects")
    # An xfail row without a reason is invisible debt — refuse it.
    for row in rows:
        if row.get("xfail") and not row.get("xfail_reason"):
            raise SystemExit(
                f"dataset row {row.get('id')!r} is marked xfail but has no xfail_reason"
            )
    return rows


def classify(row: dict, *, infra_error: bool, score_ok: bool) -> str:
    """Map a row result to PASS / FAIL / XFAIL / XPASS.

    Only a well-formed response that fails its assertions can become XFAIL. Infra
    errors (request exceptions, non-200, malformed responses) always FAIL — even for
    an xfail-marked row — so an outage or auth/credit problem can never masquerade as
    an accepted gap.
    """
    if infra_error:
        return "FAIL"
    if score_ok:
        return "XPASS" if row.get("xfail") else "PASS"
    return "XFAIL" if row.get("xfail") else "FAIL"


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
    tool_calls = [tc.get("name") for tc in (response.get("retrieval") or {}).get("tool_calls", [])]
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
    auth: EvalAuth,
    dataset: list[dict],
    model: str | None,
    initial_cost_usd: float = 0.0,
) -> RunStats:
    """Run every row once (optionally pinning a chat model) and print per-row results."""
    label = model or "(default)"
    counts = {"PASS": 0, "XFAIL": 0, "XPASS": 0, "FAIL": 0}
    total = len(dataset)
    total_cost = initial_cost_usd
    total_latency_ms = 0.0

    print(f"\n=== model: {label} ===")
    for row in dataset:
        body = {"question": row["question"], "stream": False}
        if model:
            body["model"] = model
        t0 = time.perf_counter()
        try:
            r = client.post(f"{base}/ask", json=body, headers=auth.headers())
        except httpx.HTTPError as e:
            # Infra failure: always FAIL, even for xfail rows (never mask an outage).
            latency_ms = (time.perf_counter() - t0) * 1000
            total_latency_ms += latency_ms
            counts[classify(row, infra_error=True, score_ok=False)] += 1
            print(f"[FAIL] {row['id']} ({latency_ms:.0f}ms): request error: {e!r}")
            continue
        latency_ms = (time.perf_counter() - t0) * 1000
        total_latency_ms += latency_ms
        if r.status_code != 200:
            counts[classify(row, infra_error=True, score_ok=False)] += 1
            print(f"[FAIL] {row['id']}: HTTP {r.status_code}: {r.text[:200]}")
            continue
        try:
            data = r.json()
        except ValueError:
            counts[classify(row, infra_error=True, score_ok=False)] += 1
            print(f"[FAIL] {row['id']}: invalid JSON response: {r.text[:200]}")
            continue
        if not isinstance(data, dict):
            counts[classify(row, infra_error=True, score_ok=False)] += 1
            print(f"[FAIL] {row['id']}: JSON response must be an object")
            continue
        total_cost += data.get("usage", {}).get("cost_usd", 0.0)
        ok, reason = score_row(row, data)
        status = classify(row, infra_error=False, score_ok=ok)
        counts[status] += 1
        note = reason
        if status == "XFAIL":
            note = f"{reason}  (known gap: {row.get('xfail_reason')})"
        elif status == "XPASS":
            note = f"{reason}  (known-gap row now PASSES — remove its xfail marker)"
        print(
            f"[{status}] {row['id']} ({latency_ms:.0f}ms) "
            f"${data.get('usage', {}).get('cost_usd', 0):.5f}: {note}"
        )

    passed = counts["PASS"] + counts["XPASS"]
    print(
        f"{label}: {passed}/{total} passed | "
        f"{counts['XFAIL']} xfail, {counts['XPASS']} xpass, {counts['FAIL']} fail | "
        f"cost ${total_cost:.4f} | avg latency {total_latency_ms / max(total, 1):.0f}ms"
    )
    return RunStats(
        label,
        passed,
        total,
        total_cost,
        total_latency_ms / max(total, 1),
        xfailed=counts["XFAIL"],
        xpassed=counts["XPASS"],
        failed=counts["FAIL"],
    )


def print_comparison(stats: list[RunStats]) -> None:
    name_w = max((len(s.model) for s in stats), default=5)
    width = name_w + 62
    print("\n" + "=" * width)
    print(
        f"{'model':<{name_w}}  {'pass':>7}  {'pass%':>6}  {'xfail':>5}  "
        f"{'xpass':>5}  {'fail':>4}  {'cost $':>9}  {'avg ms':>8}"
    )
    print("-" * width)
    for s in stats:
        pct = 100 * s.passed / max(s.total, 1)
        print(
            f"{s.model:<{name_w}}  {f'{s.passed}/{s.total}':>7}  {pct:>5.0f}%  "
            f"{s.xfailed:>5}  {s.xpassed:>5}  {s.failed:>4}  "
            f"{s.cost_usd:>9.4f}  {s.latency_ms:>8.0f}"
        )


def preflight(client: httpx.Client, base: str, auth: EvalAuth, model: str | None) -> float:
    """Fail once with an actionable setup error before running the full dataset."""
    label = model or "(default)"
    print(f"\nPreflight: checking {label}...")
    try:
        health = client.get(f"{base}/health")
    except httpx.HTTPError as exc:
        raise SystemExit(f"Agent is unreachable at {base}: {exc}") from exc
    if health.status_code != 200:
        raise SystemExit(
            f"Agent health check failed: HTTP {health.status_code}: {health.text[:200]}"
        )
    try:
        health_data = health.json()
    except ValueError as exc:
        raise SystemExit(f"Agent health check returned invalid JSON: {health.text[:200]}") from exc
    if health_data.get("status") != "ok":
        raise SystemExit(f"Agent dependencies are degraded: {health_data}")

    body = {"question": "Reply briefly: evaluation preflight.", "stream": False}
    if model:
        body["model"] = model
    try:
        response = client.post(f"{base}/ask", json=body, headers=auth.headers())
    except httpx.HTTPError as exc:
        raise SystemExit(f"Agent preflight request failed: {exc}") from exc
    if response.status_code == 401:
        raise SystemExit(
            "Agent rejected the evaluation JWT (401). Check JWT_SECRET or AUTH_COOKIE."
        )
    if response.status_code == 403:
        raise SystemExit(
            "Agent rejected the model override (403). Use a role allowed by "
            "MODEL_OVERRIDE_MIN_ROLE or provide an authorized AUTH_COOKIE."
        )
    if response.status_code == 400 and model:
        raise SystemExit(
            f"Agent rejected model override '{model}' (400). Check ALLOWED_MODELS: "
            f"{response.text[:200]}"
        )
    if response.status_code != 200:
        raise SystemExit(
            f"Agent preflight failed: HTTP {response.status_code}: {response.text[:200]}"
        )
    try:
        data = response.json()
    except ValueError as exc:
        raise SystemExit(f"Agent preflight returned invalid JSON: {response.text[:200]}") from exc
    cost = float(data.get("usage", {}).get("cost_usd", 0.0))
    print(f"Preflight passed: {label} (${cost:.5f}, included in total cost)")
    return cost


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the golden dataset against agent-service.")
    parser.add_argument(
        "--models",
        default=os.environ.get("MODELS", ""),
        help="Comma-separated OpenRouter model ids to A/B. Empty ⇒ one run on the server default.",
    )
    parser.add_argument("--domain", default="unibo.it", help="Domain embedded in local eval JWTs.")
    parser.add_argument(
        "--role",
        default="admin",
        choices=["admin", "business_admin", "business_staff", "standard_customer"],
        help="Role embedded in local eval JWTs.",
    )
    parser.add_argument(
        "--cookie-name",
        default="authentication_token",
        help="Cookie name used for automatically minted local JWTs.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Also exit non-zero on XPASS (a known-gap xfail row that now passes, so its "
        "marker is stale). Intended for CI on a pinned baseline model.",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Exit zero after scored results even when they contain FAIL or XPASS. Setup and "
        "preflight errors still exit non-zero. Intended for interactive evaluations.",
    )
    args = parser.parse_args()

    base = os.environ.get("AGENT_URL", "http://localhost/agent").rstrip("/")
    dataset = load_dataset(HERE / "dataset.json")
    timeout = float(os.environ.get("EVAL_TIMEOUT_SECONDS", "120"))
    models: list[str | None] = [m.strip() for m in args.models.split(",") if m.strip()] or [None]
    auth = EvalAuth.from_args(base, args)

    results: list[RunStats] = []
    with httpx.Client(timeout=timeout) as client:
        for model in models:
            preflight_cost = preflight(client, base, auth, model)
            results.append(
                run_dataset(client, base, auth, dataset, model, initial_cost_usd=preflight_cost)
            )

    if len(results) > 1:
        print_comparison(results)

    if any(s.xpassed for s in results):
        if args.report_only:
            suffix = " (report-only: exit remains zero)"
        else:
            suffix = " (failing the run under --strict)" if args.strict else ""
        print(f"\n⚠ XPASS: a known-gap (xfail) row now passes — remove its marker{suffix}.")
    if any(s.failed for s in results):
        suffix = " (report-only: exit remains zero)" if args.report_only else ""
        print(f"\n✖ unexpected failures present — see the [FAIL] rows above{suffix}.")
    return exit_code(results, strict=args.strict, report_only=args.report_only)


def exit_code(results: list[RunStats], *, strict: bool, report_only: bool = False) -> int:
    """0 unless something needs attention.

    FAIL (unexpected: assertion regressions or infra errors) always fails the run.
    XFAIL (accepted, tracked gaps) never does. XPASS (a known-gap row that now passes)
    fails only under --strict — so a stale marker is forced out on the pinned CI model
    without breaking multi-model sweeps where a stronger model legitimately passes a
    row that's an accepted gap for the baseline. Report-only mode always returns zero
    after scored results; setup and preflight errors occur before this function.
    """
    if report_only:
        return 0
    unexpected = any(s.failed for s in results)
    stale = any(s.xpassed for s in results)
    return 1 if unexpected or (stale and strict) else 0


if __name__ == "__main__":
    sys.exit(main())
