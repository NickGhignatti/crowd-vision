"""One building tick as digital-twin reads it: `schemas/fixtures/wifi-observations.json`."""

from __future__ import annotations

import heapq
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from app.tokens import Scan, Sighting

# Telemetry refuses a tick over any of these whole; together they keep it under its 1 MiB body.
MAX_CONNECTED = 2000
MAX_BURSTS = 2000
MAX_HEARD = 6


def observations_batch(
    building_id: str,
    tick_ms: int,
    answered: Iterable[str],
    sightings: Iterable[Sighting],
    scans: Iterable[Scan],
    devices_per_person: float | None = None,
) -> dict[str, Any]:
    """The body to POST, trimmed to the limits; burst starts arrive in seconds, leave as ms."""
    rows = _keep(list(sightings), MAX_CONNECTED, key=lambda s: s.signal)
    bursts = _keep(list(scans), MAX_BURSTS, key=lambda s: s.started)
    batch: dict[str, Any] = {
        "buildingId": building_id,
        "tick": tick_ms,
        "answered": list(dict.fromkeys(answered)),
        "connected": [{"token": s.token, "router": s.router, "signal": s.signal} for s in rows],
        "bursts": [
            {"token": s.token, "started": round(s.started * 1000), "heard": _loudest(s.heard)}
            for s in bursts
        ],
    }
    if devices_per_person is not None:
        batch["devicesPerPerson"] = devices_per_person
    return batch


def _keep[T](items: list[T], limit: int, key: Callable[[T], float]) -> list[T]:
    """`items` untouched when within `limit`, else the `limit` greatest by `key`."""
    return items if len(items) <= limit else heapq.nlargest(limit, items, key=key)


def _loudest(heard: Mapping[str, int]) -> dict[str, int]:
    return dict(_keep(list(heard.items()), MAX_HEARD, key=lambda item: item[1]))
