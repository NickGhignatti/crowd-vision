"""One building tick as digital-twin reads it: `schemas/fixtures/wifi-observations.json`."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Iterable

    from app.tokens import Scan, Sighting


def observations_batch(
    building_id: str,
    tick_ms: int,
    answered: Iterable[str],
    sightings: Iterable[Sighting],
    scans: Iterable[Scan],
) -> dict[str, Any]:
    """The body to POST; burst starts arrive in seconds and leave as whole milliseconds."""
    return {
        "buildingId": building_id,
        "tick": tick_ms,
        "answered": list(dict.fromkeys(answered)),
        "connected": [
            {"token": s.token, "router": s.router, "signal": s.signal} for s in sightings
        ],
        "bursts": [
            {"token": s.token, "started": round(s.started * 1000), "heard": dict(s.heard)}
            for s in scans
        ],
    }
