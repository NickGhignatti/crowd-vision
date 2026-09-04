"""One tick of the collector: poll every AP, safely.

Called once per interval by the run loop (not yet written). Each AP's failure is caught
here so it can never crash the shared tick -- one broken radio must not take down the
whole building's read.
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

from app.ubus import ApSession, UbusError
from app.zones import ZoneTracker, best_by_zone

if TYPE_CHECKING:
    from collections import Counter
    from collections.abc import Callable, Mapping

    from app.config import Building, Config
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


def _ap_zones(building: Building) -> dict[str, str]:
    return {ap.name: ap.zone for ap in building.ap}


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
    return build_readings(polled, _ap_zones(building))


def tick_building(
    building: Building, sessions: Mapping[str, ApSession], tracker: ZoneTracker
) -> tuple[dict[str, str], Counter[tuple[str, str]]]:
    """One building, one tick, fully assembled: poll, resolve per-zone signal strength, and
    hand it to the building's own long-lived `ZoneTracker` for the confirmed result.

    `batch_poll_by_building` alone stops at flat readings; `ZoneTracker.update` needs the
    per-MAC-per-zone view `best_by_zone` produces, not the flat list -- this is the missing
    connective step between the two.
    """
    readings, available = batch_poll_by_building(building, sessions)
    observed = best_by_zone(readings, _ap_zones(building))
    return tracker.update(observed, available)


def tick(
    config: Config,
    sessions_by_building: Mapping[str, Mapping[str, ApSession]],
    trackers_by_building: Mapping[str, ZoneTracker],
) -> dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]:
    """One tick across every building in `config`, keyed by building name.

    `sessions_by_building` and `trackers_by_building` are external, long-lived state -- built
    once by whoever starts the run and kept alive across every tick, same reasoning as
    `batch_poll_by_building`'s `sessions` parameter. This function only routes each building
    to its own slice of that state; it never constructs sessions or trackers itself, and a
    building's zone names never interact with another building's tracker.
    """
    return {
        building.name: tick_building(
            building,
            sessions_by_building[building.name],
            trackers_by_building[building.name],
        )
        for building in config.buildings
    }


def build_sessions(config: Config, timeout: int) -> dict[str, dict[str, ApSession]]:
    """One ApSession per AP, grouped by building -- built once for the whole run.

    Must be called exactly once per run, not per tick: `tick`/`tick_building` take these as
    external state precisely so an ApSession's cached login token survives across ticks.
    """
    return {
        building.name: {ap.name: ApSession(ap, timeout) for ap in building.ap}
        for building in config.buildings
    }


def build_trackers(
    config: Config, polls: int, margin_db: float, absent_polls: int
) -> dict[str, ZoneTracker]:
    """One ZoneTracker per building -- built once for the whole run, same reasoning as
    `build_sessions`: hysteresis state must survive across ticks to mean anything."""
    return {
        building.name: ZoneTracker(polls, margin_db, absent_polls) for building in config.buildings
    }


def run(
    config: Config,
    sessions_by_building: Mapping[str, Mapping[str, ApSession]],
    trackers_by_building: Mapping[str, ZoneTracker],
    interval_s: float,
    *,
    on_tick: Callable[[dict[str, tuple[dict[str, str], Counter[tuple[str, str]]]]], None]
    | None = None,
    max_ticks: int | None = None,
    now: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Tick every building at a fixed interval, forever unless `max_ticks` is given.

    Scheduled against a monotonic clock, anchored at a fixed base (`next_tick += interval_s`
    each pass) rather than `sleep(interval_s)` after each tick: the latter lets a tick's own
    processing time compound into drift every single pass, quietly slowing the real poll rate
    below what phase 3's hysteresis numbers were tuned against. A monotonic clock also can't
    jump the way wall-clock time can (NTP sync, DST), which would otherwise skip or
    double-fire a tick.

    `on_tick`, `now`, `sleep` are injectable so this is testable without actually waiting or
    running forever -- production code calls this with all three left at their defaults.
    `max_ticks` is what a future `--once` CLI flag maps to: run exactly one tick and return.
    """
    next_tick = now()
    ticks_done = 0
    while True:
        results = tick(config, sessions_by_building, trackers_by_building)
        if on_tick is not None:
            on_tick(results)
        ticks_done += 1
        if max_ticks is not None and ticks_done >= max_ticks:
            return
        next_tick += interval_s
        sleep(max(0.0, next_tick - now()))


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
