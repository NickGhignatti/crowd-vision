"""require_user's two paths: the mesh-injected x-gateway-claims header
(production, verified once at the edge — Istio or Caddy+claims-gateway/verify
in docker-compose dev) and the local-only eval HS256 bypass (see
app/auth.py's _decode). Signature/issuer/algorithm-confusion attacks against
the gateway token are defended once, at the edge, not re-tested here."""

from __future__ import annotations

import base64
import json
import time

import jwt
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import require_user
from app.config import get_settings

EVAL_SECRET = "test-eval-secret-that-is-at-least-32-bytes-long"


def _claims_header(payload: dict) -> str:
    return base64.b64encode(json.dumps(payload).encode()).decode()


def _request(*, claims: str | None = None, bearer: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if claims:
        headers.append((b"x-gateway-claims", claims.encode()))
    if bearer:
        headers.append((b"authorization", f"Bearer {bearer}".encode()))
    scope: dict = {"type": "http", "headers": headers}
    return Request(scope)


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("EVAL_JWT_SECRET", EVAL_SECRET)
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def test_accepts_a_valid_claims_header():
    header = _claims_header({"sub": "acc-1", "accountName": "mario", "memberships": []})

    user = await require_user(_request(claims=header))

    assert user.user_id == "acc-1"
    assert user.raw_token == header


async def test_normalizes_gateway_memberships_into_roles_and_domains():
    header = _claims_header(
        {"sub": "acc-1", "memberships": [{"domain": "unibo", "role": "standard_customer"}]}
    )

    user = await require_user(_request(claims=header))

    assert user.roles == ["standard_customer"]
    assert user.domains == ["unibo"]

async def test_rejects_a_claims_header_that_isnt_valid_base64_json():
    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request(claims="not-valid-base64-json"))
    assert exc_info.value.status_code == 401


async def test_rejects_a_claims_header_missing_subject():
    header = _claims_header({"accountName": "mario", "memberships": []})

    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request(claims=header))
    assert exc_info.value.status_code == 401


async def test_accepts_the_eval_bypass_hs256_token_when_eval_secret_is_configured():
    token = jwt.encode(
        {
            "sub": "evalbot",
            "roles": ["admin"],
            "domains": ["unibo.it"],
            "exp": int(time.time()) + 300,
        },
        EVAL_SECRET,
        algorithm="HS256",
    )

    user = await require_user(_request(bearer=token))

    assert user.user_id == "evalbot"
    assert user.roles == ["admin"]
    assert user.domains == ["unibo.it"]


async def test_rejects_hs256_tokens_when_eval_secret_is_not_configured(monkeypatch):
    monkeypatch.delenv("EVAL_JWT_SECRET", raising=False)
    get_settings.cache_clear()
    token = jwt.encode(
        {"sub": "evalbot", "roles": ["admin"], "exp": int(time.time()) + 300},
        EVAL_SECRET,
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request(bearer=token))
    assert exc_info.value.status_code == 401


async def test_rejects_an_hs256_token_signed_with_the_wrong_eval_secret():
    token = jwt.encode(
        {"sub": "evalbot", "roles": ["admin"], "exp": int(time.time()) + 300},
        "not-the-configured-secret-but-still-32-bytes",
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request(bearer=token))
    assert exc_info.value.status_code == 401


async def test_claims_header_takes_priority_over_a_bearer_eval_token():
    # A request that somehow carries both is trusted via the mesh-verified
    # header, never the self-asserted bearer token.
    header = _claims_header({"sub": "acc-1", "memberships": []})
    eval_token = jwt.encode(
        {"sub": "evalbot", "exp": int(time.time()) + 300}, EVAL_SECRET, algorithm="HS256"
    )

    user = await require_user(_request(claims=header, bearer=eval_token))

    assert user.user_id == "acc-1"


async def test_rejects_a_missing_token():
    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request())
    assert exc_info.value.status_code == 401


async def test_returns_anonymous_user_when_auth_is_disabled(monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "false")
    get_settings.cache_clear()

    user = await require_user(_request())

    assert user.user_id == "anonymous"
