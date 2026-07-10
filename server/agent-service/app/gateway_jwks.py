"""Minimal JWKS client for claims-gateway's published RS256 signing keys.

Mirrors the hand-rolled clients in each Node service's `config/gatewayJwks.ts`
(fetch, cache briefly, index by kid) rather than leaning on a bigger SDK's own
JWKS convenience layer, so the caching/testing story stays consistent across
languages.
"""

from __future__ import annotations

import time

import httpx
from jwt import PyJWK

_CACHE_TTL_SECONDS = 10 * 60

_cache: dict[str, PyJWK] | None = None
_cache_fetched_at: float = 0.0


class GatewayJwksError(Exception):
    """The gateway's JWKS couldn't be fetched, or had no matching key."""


async def _load_keys(jwks_uri: str) -> dict[str, PyJWK]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(jwks_uri)
    response.raise_for_status()
    body = response.json()
    return {jwk["kid"]: PyJWK.from_dict(jwk) for jwk in body.get("keys", [])}


async def get_gateway_signing_key(kid: str | None, jwks_uri: str) -> PyJWK:
    global _cache, _cache_fetched_at
    if _cache is None or time.monotonic() - _cache_fetched_at > _CACHE_TTL_SECONDS:
        try:
            _cache = await _load_keys(jwks_uri)
        except httpx.HTTPError as exc:
            raise GatewayJwksError(f"fetching gateway JWKS failed: {exc}") from exc
        _cache_fetched_at = time.monotonic()

    key = _cache.get(kid) if kid else None
    if key is None:
        raise GatewayJwksError(f"no matching gateway signing key for kid {kid}")
    return key


def reset_gateway_jwks_cache_for_tests() -> None:
    global _cache, _cache_fetched_at
    _cache = None
    _cache_fetched_at = 0.0
