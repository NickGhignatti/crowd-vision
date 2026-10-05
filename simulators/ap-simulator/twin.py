"""A building's rooms and router placements, read from digital-twin as the simulator's own identity."""

from __future__ import annotations

import base64
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from typing import Any

from geometry import Point, Room

logger = logging.getLogger(__name__)

TIMEOUT_S = 2.0
"""Both reads must fit inside telemetry's 5 s wait on /control/start."""

SYSTEM_CLAIMS = base64.b64encode(
    json.dumps(
        {"sub": "system:ap-simulator", "accountName": "system:ap-simulator", "memberships": []}
    ).encode()
).decode()

_UNREADABLE = (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError)


class TwinError(RuntimeError):
    """digital-twin could not describe the building."""


def fetch_geometry(
    base_url: str,
    building_id: str,
    opener: Callable[..., Any] = urllib.request.urlopen,
) -> tuple[list[Room], dict[str, Point] | None]:
    """The building's rooms, and where its sensors sit — None when twin will not say."""
    path = f"{base_url.rstrip('/')}/building/{urllib.parse.quote(building_id, safe='')}"
    try:
        rooms = [_room(room) for room in _get(path, opener)["rooms"]]
    except _UNREADABLE as error:
        raise TwinError(f"{path}: {error}") from error
    try:
        placements = {
            p["sensorId"]: _point(p["position"]) for p in _get(f"{path}/placements", opener)
        }
    except _UNREADABLE as error:
        logger.warning("placements unreadable, routers sit at their room centres: %s", error)
        return rooms, None
    return rooms, placements


def _get(url: str, opener: Callable[..., Any]) -> Any:
    request = urllib.request.Request(url, headers={"x-gateway-claims": SYSTEM_CLAIMS})
    with opener(request, timeout=TIMEOUT_S) as response:
        return json.loads(response.read())


def _room(data: dict) -> Room:
    size = data["dimensions"]
    return Room(
        str(data["id"]),
        _point(data["position"]),
        float(size["width"]),
        float(size["height"]),
        float(size["depth"]),
    )


def _point(data: dict) -> Point:
    return Point(float(data["x"]), float(data["y"]), float(data["z"]))
