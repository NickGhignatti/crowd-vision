"""The twin RAG tool must call twin-service AS the asking user.

twin-service authenticates its routes, so the tool has to forward the caller's JWT.
These tests cover both halves: `require_user` keeping the raw token, and `auth_headers`
attaching it as a bearer header (and omitting it when there is no token).
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


def test_auth_headers_forwards_caller_jwt_as_bearer():
    assert auth_headers(AuthUser(user_id="u1", raw_token="tok-123")) == {
        "Authorization": "Bearer tok-123"
    }


def test_auth_headers_empty_without_token():
    assert auth_headers(AuthUser(user_id="anon")) == {}


async def test_require_user_keeps_raw_token_for_forwarding(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    monkeypatch.setenv("REQUIRE_AUTH", "true")
    get_settings.cache_clear()
    try:
        token = jwt.encode({"accountId": "u1", "accountName": "alice"}, SECRET, algorithm="HS256")

        user = await require_user(_request({"authorization": f"Bearer {token}"}))

        assert user.user_id == "u1"
        assert user.raw_token == token
    finally:
        get_settings.cache_clear()
