"""The twin RAG tool must call twin-service AS the asking user.

twin-service trusts the mesh-injected x-gateway-claims header, so the tool
has to forward the caller's claims. These tests cover both halves:
`require_user` keeping the raw claims, and `auth_headers` attaching them as
the x-gateway-claims header (and omitting it when there is no token).
"""

import jwt
from starlette.requests import Request

from app.agent.tools.downstream import auth_headers
from app.auth import AuthUser, require_user
from app.config import get_settings

SECRET = "test-secret-that-is-at-least-32-bytes-long"


def _request(headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
    }
    return Request(scope)


def test_auth_headers_forwards_caller_claims():
    assert auth_headers(AuthUser(user_id="u1", raw_token="tok-123")) == {
        "x-gateway-claims": "tok-123"
    }


def test_auth_headers_empty_without_token():
    assert auth_headers(AuthUser(user_id="anon")) == {}


async def test_require_user_keeps_raw_token_for_forwarding(monkeypatch):
    # Uses the eval-bypass HS256 path (see app/auth.py) rather than the mesh
    # claims header — simpler here since this test only cares that
    # require_user preserves the raw token, not which path verified it.
    monkeypatch.setenv("EVAL_JWT_SECRET", SECRET)
    monkeypatch.setenv("REQUIRE_AUTH", "true")
    get_settings.cache_clear()
    try:
        token = jwt.encode({"sub": "u1"}, SECRET, algorithm="HS256")

        user = await require_user(_request({"authorization": f"Bearer {token}"}))

        assert user.user_id == "u1"
        assert user.raw_token == token
    finally:
        get_settings.cache_clear()
