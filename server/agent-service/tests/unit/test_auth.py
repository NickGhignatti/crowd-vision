"""require_user's verification paths: claims-gateway RS256 (production) and
the local-only eval HS256 bypass (see app/auth.py's _decode)."""

from __future__ import annotations

import base64
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import require_user
from app.config import get_settings
from app.gateway_jwks import reset_gateway_jwks_cache_for_tests

GATEWAY_ISSUER = "cv-gateway"
GATEWAY_JWKS_URI = "http://gateway.test/.well-known/jwks.json"
EVAL_SECRET = "test-eval-secret-that-is-at-least-32-bytes-long"
KID = "test-kid"

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key = _private_key.public_key()


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _jwk_from_public_key() -> dict:
    numbers = _public_key.public_numbers()
    n = numbers.n.to_bytes((numbers.n.bit_length() + 7) // 8, "big")
    e = numbers.e.to_bytes((numbers.e.bit_length() + 7) // 8, "big")
    return {
        "kty": "RSA",
        "kid": KID,
        "use": "sig",
        "alg": "RS256",
        "n": _b64url(n),
        "e": _b64url(e),
    }


def _sign_rs256(payload: dict, *, iss: str = GATEWAY_ISSUER, kid: str = KID) -> str:
    return jwt.encode(
        {**payload, "iss": iss, "exp": int(time.time()) + 3600},
        _private_key,
        algorithm="RS256",
        headers={"kid": kid},
    )


def _request(*, cookie: str | None = None, bearer: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if bearer:
        headers.append((b"authorization", f"Bearer {bearer}".encode()))
    if cookie:
        headers.append((b"cookie", f"authentication_token={cookie}".encode()))
    scope: dict = {"type": "http", "headers": headers}
    return Request(scope)


class _FakeAsyncClient:
    """Stands in for httpx.AsyncClient — returns a fixed JWKS document instead
    of making a real HTTP call, the same seam Node's tests patch `global.fetch`
    at."""

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *exc) -> bool:
        return False

    async def get(self, _url: str):
        return _FakeResponse({"keys": [_jwk_from_public_key()]})


class _FakeResponse:
    def __init__(self, body: dict) -> None:
        self._body = body

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return self._body


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("GATEWAY_JWKS_URI", GATEWAY_JWKS_URI)
    monkeypatch.setenv("GATEWAY_ISSUER", GATEWAY_ISSUER)
    monkeypatch.setenv("EVAL_JWT_SECRET", EVAL_SECRET)
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.setattr("app.gateway_jwks.httpx.AsyncClient", _FakeAsyncClient)
    reset_gateway_jwks_cache_for_tests()
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def test_accepts_a_gateway_minted_rs256_token():
    token = _sign_rs256({"sub": "acc-1", "accountName": "mario", "memberships": []})

    user = await require_user(_request(bearer=token))

    assert user.user_id == "acc-1"
    assert user.raw_token == token


async def test_normalizes_gateway_memberships_into_roles_and_domains():
    token = _sign_rs256(
        {
            "sub": "acc-1",
            "memberships": [{"domain": "unibo", "role": "standard_customer"}],
        }
    )

    user = await require_user(_request(bearer=token))

    assert user.roles == ["standard_customer"]
    assert user.domains == ["unibo"]


async def test_reads_token_from_cookie_when_no_bearer_header():
    token = _sign_rs256({"sub": "acc-1", "memberships": []})

    user = await require_user(_request(cookie=token))

    assert user.user_id == "acc-1"


async def test_rejects_an_rs256_token_from_an_untrusted_issuer():
    token = _sign_rs256({"sub": "acc-1", "memberships": []}, iss="someone-elses-gateway")

    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request(bearer=token))
    assert exc_info.value.status_code == 401


async def test_rejects_an_rs256_token_signed_by_an_untrusted_key():
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(
        {"sub": "acc-1", "memberships": [], "iss": GATEWAY_ISSUER, "exp": int(time.time()) + 3600},
        attacker_key,
        algorithm="RS256",
        headers={"kid": KID},
    )

    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request(bearer=token))
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


async def test_rejects_a_missing_token():
    with pytest.raises(HTTPException) as exc_info:
        await require_user(_request())
    assert exc_info.value.status_code == 401


async def test_returns_anonymous_user_when_auth_is_disabled(monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "false")
    get_settings.cache_clear()

    user = await require_user(_request())

    assert user.user_id == "anonymous"
