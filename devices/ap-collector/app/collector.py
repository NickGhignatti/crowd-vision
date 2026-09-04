"""One tick of the collector: poll every AP, safely.

Called once per interval by the run loop (not yet written). Each AP's failure is caught
here so it can never crash the shared tick -- one broken radio must not take down the
whole building's read.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.ubus import UbusError

if TYPE_CHECKING:
    from collections.abc import Mapping

    from app.config import Building
    from app.ubus import ApSession
    from app.zones import Reading


def poll_one(ap_name: str, session: ApSession) -> tuple[str, list[tuple[str, int]] | None]:
    """One AP's stations this tick, or None if it failed to answer.

    None and an empty list are different facts: a failed AP must not silently become an
    empty room downstream -- ZoneTracker's `available_zones` can only be built correctly if
    the two stay distinguishable this early.
    """
    try:
        return ap_name, session.stations()
    except UbusError:
        return ap_name, None


def poll_aps(
    sessions: Mapping[str, ApSession],
) -> list[tuple[str, list[tuple[str, int]] | None]]:
    """Poll every AP, each with its own session, returning their stations or None if they failed."""
    return [poll_one(ap_name, session) for ap_name, session in sessions.items()]


def batch_poll_by_building(
    building: Building, sessions: Mapping[str, ApSession]
) -> tuple[list[Reading], set[str]]:
    """One tick for one building: poll it and build its readings/available zones.

    Zones come from `building`'s own AP config, not hand-built by the caller. `sessions`
    stays a separate parameter rather than being built here from `building`: an ApSession
    caches its login token across ticks, so constructing fresh ones on every call would
    throw that cache away and force a relogin per AP every tick.
    """
    polled = poll_aps(sessions)
    ap_zones = {ap.name: ap.zone for ap in building.ap}
    return build_readings(polled, ap_zones)


def build_readings(
    polled: list[tuple[str, list[tuple[str, int]] | None]],
    ap_zones: Mapping[str, str],
) -> tuple[list[Reading], set[str]]:
    """Flatten polled per-AP stations into (ap, mac, rssi) readings, plus which zones answered.

    A failed AP (`stations is None`) contributes to neither: not to readings, and not to
    `available_zones` -- a zone stays available as long as *any* AP mapped to it answered,
    even if that AP heard zero devices this tick.
    """
    readings: list[Reading] = []
    available: set[str] = set()
    for ap_name, stations in polled:
        if stations is None:
            continue
        zone = ap_zones.get(ap_name)
        if zone is not None:
            available.add(zone)
        readings.extend((ap_name, mac, rssi) for mac, rssi in stations)
    return readings, available
