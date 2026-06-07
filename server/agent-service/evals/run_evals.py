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
    passed = 0
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
    args = parser.parse_args()

    base = os.environ.get("AGENT_URL", "http://localhost/agent").rstrip("/")
    dataset = load_dataset(HERE / "dataset.jsonl")
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

    # Non-zero exit if any row failed in any run, so this can gate CI.
    return 0 if all(s.passed == s.total for s in results) else 1


if __name__ == "__main__":
    sys.exit(main())
