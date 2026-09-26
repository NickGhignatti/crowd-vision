"""Which routers to poll: read from telemetry, joined with this site's own logins.

Telemetry knows where each router is (building, room, ubus address). The site knows how to
log in to it. Neither half ever travels to the other side.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any

from app.config import AccessPoint, Building

if TYPE_CHECKING:
    from collections.abc import Callable

    from app.config import Site

COLLECTOR_PATH = "/collector"
IWINFO_DRIVER = "openwrt-iwinfo"
_ROUTER_KEYS = {"sensorId", "roomId", "driver", "endpoint"}


class SyncError(RuntimeError):
    """The router list could not be read -- telemetry unreachable, refusing, or malformed."""


def sign_request(secret: bytes, timestamp: str) -> str:
    """A GET has no body, so it signs this canonical string; the timestamp bounds replay."""
    canonical = f"GET {COLLECTOR_PATH}\n{timestamp}".encode()
    return hmac.new(secret, canonical, hashlib.sha256).hexdigest()


def fetch_routers(
    telemetry_url: str,
    secret: bytes,
    timeout: float,
    now: Callable[[], float] = time.time,
) -> dict[str, Any]:
    """Every router this collector may poll, as telemetry answers it."""
    stamp = str(int(now()))
    request = urllib.request.Request(  # noqa: S310
        telemetry_url.rstrip("/") + COLLECTOR_PATH,
        headers={"x-signature": sign_request(secret, stamp), "x-timestamp": stamp},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            answer = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise SyncError(f"{request.full_url} returned {error.code}: {error.reason}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise SyncError(f"{request.full_url} unreadable: {error}") from error
    try:
        return parse_answer(answer)
    except ValueError as error:
        raise SyncError(f"{request.full_url} answered a malformed router list: {error}") from error


def parse_answer(answer: Any) -> dict[str, Any]:
    """The answer, checked against the contract; raises ValueError on any other shape."""
    if not isinstance(answer, dict) or set(answer) != {"buildings"}:
        raise ValueError("the answer must carry exactly buildings")
    if not isinstance(answer["buildings"], list):
        raise ValueError("buildings must be a list")
    for building in answer["buildings"]:
        if not isinstance(building, dict) or set(building) != {"buildingId", "routers"}:
            raise ValueError("a building must carry exactly buildingId and routers")
        if not _text(building["buildingId"]):
            raise ValueError("buildingId must be a non-empty string")
        routers = building["routers"]
        if not isinstance(routers, list) or not routers:
            raise ValueError(f"{building['buildingId']}: routers must be a non-empty list")
        for router in routers:
            if not isinstance(router, dict) or not set(router) <= _ROUTER_KEYS:
                raise ValueError(f"a router may carry only {sorted(_ROUTER_KEYS)}")
            if not all(_text(router.get(key)) for key in ("sensorId", "roomId")):
                raise ValueError("a router's sensorId and roomId must be non-empty strings")
            if not all(_text(router[key]) for key in ("driver", "endpoint") if key in router):
                raise ValueError("a router's driver and endpoint, when sent, must be non-empty")
    return answer


def buildings_from(answer: dict[str, Any], site: Site) -> list[Building]:
    """One Building per answered building that still has a router the site can reach."""
    buildings: list[Building] = []
    for entry in answer["buildings"]:
        aps = [ap for ap in (_access_point(r, site) for r in entry["routers"]) if ap]
        if aps:
            buildings.append(Building(name=entry["buildingId"], ap=aps))
    return buildings


def _access_point(router: dict[str, str], site: Site) -> AccessPoint | None:
    sensor_id = router["sensorId"]
    url = router.get("endpoint")
    if url is None and site.endpoint_template:
        url = site.endpoint_template.format(sensorId=sensor_id)
    if url is None:
        print(f"router {sensor_id}: no endpoint and no endpointTemplate, skipped", file=sys.stderr)
        return None
    login = site.login_for(sensor_id)
    return AccessPoint.from_json(
        {
            "name": sensor_id,
            "zone": router["roomId"],
            "url": url,
            "username": login.username,
            "password": login.password,
            "ifaces": login.ifaces,
            "reader": "iwinfo" if router.get("driver") == IWINFO_DRIVER else "hostapd",
        }
    )


def _text(value: object) -> bool:
    return isinstance(value, str) and bool(value)
