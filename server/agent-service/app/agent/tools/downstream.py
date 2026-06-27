from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.config import get_settings

_twin_client: httpx.AsyncClient | None = None
_sensor_client: httpx.AsyncClient | None = None
_TRANSIENT_STATUSES = {502, 503, 504}


def get_twin_client() -> httpx.AsyncClient:
    global _twin_client
    if _twin_client is None or _twin_client.is_closed:
        settings = get_settings()
        _twin_client = httpx.AsyncClient(
            base_url=settings.twin_service_url,
            timeout=settings.twin_timeout_seconds,
        )
    return _twin_client


def get_sensor_client() -> httpx.AsyncClient:
    global _sensor_client
    if _sensor_client is None or _sensor_client.is_closed:
        settings = get_settings()
        _sensor_client = httpx.AsyncClient(
            base_url=settings.sensor_service_url,
            timeout=settings.sensor_timeout_seconds,
        )
    return _sensor_client


async def get_with_retry(
    client: httpx.AsyncClient,
    path: str,
    *,
    params: dict[str, Any] | None = None,
) -> httpx.Response:
    """GET with one bounded retry for transport errors and transient gateways."""
    for attempt in range(2):
        try:
            response = await client.get(path, params=params)
        except httpx.TransportError:
            if attempt == 1:
                raise
        else:
            if response.status_code not in _TRANSIENT_STATUSES or attempt == 1:
                return response
        await asyncio.sleep(0.1)

    raise RuntimeError("unreachable")


def downstream_error(service: str, response: httpx.Response) -> str:
    if response.status_code == 429:
        return f"{service} is rate-limited; try again later"
    return f"{service} request failed with status {response.status_code}"


async def close_downstream_clients() -> None:
    global _sensor_client, _twin_client
    clients = [client for client in (_twin_client, _sensor_client) if client is not None]
    if clients:
        await asyncio.gather(*(client.aclose() for client in clients))
    _twin_client = None
    _sensor_client = None
