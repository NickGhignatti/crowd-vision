import argparse

import httpx
import jwt
import pytest

from evals import run_evals

TEST_SECRET = "test-secret-that-is-at-least-32-bytes-long"


def _args(**overrides):
    values = {
        "cookie_name": "authentication_token",
        "role": "admin",
        "domain": "unibo.it",
    }
    values.update(overrides)
    return argparse.Namespace(**values)


def test_read_env_value_handles_export_quotes_and_comments(tmp_path):
    env = tmp_path / ".env"
    env.write_text(
        "\n".join(
            [
                "# ignored",
                "export OTHER=value",
                'export EVAL_JWT_SECRET="quoted secret" # comment',
                "PLAIN=value # comment",
            ]
        )
    )
    assert run_evals._read_env_value(env, "EVAL_JWT_SECRET") == "quoted secret"
    assert run_evals._read_env_value(env, "PLAIN") == "value"


def test_remote_url_requires_explicit_cookie(monkeypatch):
    monkeypatch.delenv("AUTH_COOKIE", raising=False)
    with pytest.raises(SystemExit, match="restricted to local"):
        run_evals.EvalAuth.from_args("https://example.com/agent", _args())


def test_explicit_cookie_is_preserved_for_remote_run(monkeypatch):
    monkeypatch.setenv("AUTH_COOKIE", "authentication_token=remote")
    auth = run_evals.EvalAuth.from_args("https://example.com/agent", _args())
    assert auth.headers() == {"Cookie": "authentication_token=remote"}


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/agent",
        "http://127.0.0.1/agent",
        "http://[::1]/agent",
        "http://agent-service:3000",
        "http://host.docker.internal/agent",
    ],
)
def test_expected_local_urls_allow_automatic_minting(url):
    assert run_evals._is_local_url(url)


def test_local_auth_mints_a_fresh_short_lived_token_per_request(monkeypatch):
    timestamps = iter([100, 200])
    monkeypatch.setattr(run_evals.time, "time", lambda: next(timestamps))
    auth = run_evals.EvalAuth("authentication_token", "admin", "unibo.it", secret=TEST_SECRET)

    first = auth.headers()["Cookie"].split("=", 1)[1]
    second = auth.headers()["Cookie"].split("=", 1)[1]
    first_payload = jwt.decode(
        first, TEST_SECRET, algorithms=["HS256"], options={"verify_exp": False}
    )
    second_payload = jwt.decode(
        second, TEST_SECRET, algorithms=["HS256"], options={"verify_exp": False}
    )

    assert first_payload["iat"] == 100
    assert first_payload["exp"] == 400
    assert second_payload["iat"] == 200
    assert second_payload["exp"] == 500
    assert first != second


@pytest.mark.parametrize(
    ("status", "body", "message"),
    [
        (401, {}, "rejected the evaluation JWT"),
        (403, {}, "rejected the model override"),
        (400, {}, "Check ALLOWED_MODELS"),
    ],
)
def test_preflight_reports_auth_and_model_setup_errors_once(status, body, message):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/health"):
            return httpx.Response(200, json={"status": "ok", "db": "ok"})
        return httpx.Response(status, json=body)

    auth = run_evals.EvalAuth("authentication_token", "admin", "unibo.it", secret=TEST_SECRET)
    with (
        httpx.Client(transport=httpx.MockTransport(handler)) as client,
        pytest.raises(SystemExit, match=message),
    ):
        run_evals.preflight(client, "http://localhost/agent", auth, "model-a")


def test_preflight_reports_invalid_health_response():
    client = httpx.Client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text="no"))
    )
    auth = run_evals.EvalAuth("authentication_token", "admin", "unibo.it", secret=TEST_SECRET)
    with client, pytest.raises(SystemExit, match="invalid JSON"):
        run_evals.preflight(client, "http://localhost/agent", auth, None)


def test_preflight_returns_cost_for_inclusion_in_model_total():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/health"):
            return httpx.Response(200, json={"status": "ok", "db": "ok"})
        return httpx.Response(200, json={"usage": {"cost_usd": 0.001}})

    auth = run_evals.EvalAuth("authentication_token", "admin", "unibo.it", secret=TEST_SECRET)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert run_evals.preflight(client, "http://localhost/agent", auth, "model-a") == 0.001
