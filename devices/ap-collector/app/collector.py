"""One tick of the collector: poll every AP, safely.

Each AP's failure is caught here so it can never crash the shared tick -- one broken radio
must not take down the whole building's read.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, NamedTuple

from app.ubus import ApSession, UbusError

if TYPE_CHECKING:
    from collections.abc import Callable, Mapping, Sequence

    from app.config import AccessPoint, Building, Config
    from app.ubus import Station, StationsSource


Reading = tuple[str, str, int]
"""One station as one AP heard it: (ap, mac, rssi_dbm)."""

SAME_AGE_MS = 1_000
"""Idle times this close are one age: each AP's session reads the clock on its own thread."""


class TickResult(NamedTuple):
    """One building's tick: which routers answered, and what they heard."""

    answered: set[str]
    """Routers that replied; any other router failed, so its phones are unknown, not gone."""
    rows: list[Reading]
    """(router, mac, rssi) left after dropping roam leftovers."""


def poll_one(ap_name: str, session: StationsSource) -> tuple[str, list[Station] | None]:
    """One AP's stations this tick, or None if it failed to answer.

    None and an empty list are different facts: telemetry reports an empty room only for a
    router that answered, so a failed AP must stay distinguishable this early.
    """
    try:
        return ap_name, session.stations()
    except UbusError:
        return ap_name, None


def poll_aps(
    sessions: Mapping[str, StationsSource],
) -> list[tuple[str, list[Station] | None]]:
    """Poll every AP concurrently, returning its stations or None if it failed.

    Concurrent for budget, not speed: in sequence a tick costs the *sum* of its APs'
    timeouts, so dark APs silently stretch it past `pollIntervalS`.
    """
    if not sessions:
        return []
    with ThreadPoolExecutor(max_workers=len(sessions)) as pool:
        return list(pool.map(lambda item: poll_one(*item), sessions.items()))


def tick_building(building: Building, sessions: Mapping[str, StationsSource]) -> TickResult:
    """One building, one tick: poll its APs and keep the rows that are not roam leftovers.

    `sessions` is passed in rather than built here from `building`: an ApSession caches its
    login token across ticks, so fresh ones on every call would force a relogin per AP.
    """
    readings, answered = build_readings(poll_aps(sessions))
    return TickResult(answered, readings)


def tick(
    config: Config,
    sessions_by_building: Mapping[str, Mapping[str, StationsSource]],
) -> dict[str, TickResult]:
    """One tick across every building in `config`, keyed by building id.

    `sessions_by_building` is long-lived state, built once by whoever starts the run and kept
    across every tick; this function only routes each building to its own sessions.
    """
    return {
        building.name: tick_building(building, sessions_by_building[building.name])
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


def _same_ap(a: AccessPoint, b: AccessPoint) -> bool:
    fields = ("url", "username", "password", "ifaces", "reader")
    return all(getattr(a, f) == getattr(b, f) for f in fields)


def sync_state(
    config: Config,
    sessions_by_building: dict[str, dict[str, ApSession]],
    timeout: int,
) -> None:
    """Reconcile the long-lived sessions with `config.buildings` after a router-list refresh.

    Kept in place, not rebuilt: a router that stayed keeps its login token.
    """
    wanted = {building.name: building for building in config.buildings}
    for name in set(sessions_by_building) - set(wanted):
        del sessions_by_building[name]
    for name, building in wanted.items():
        current = sessions_by_building.setdefault(name, {})
        aps = {ap.name: ap for ap in building.ap}
        for ap_name in set(current) - set(aps):
            del current[ap_name]
        for ap_name, ap in aps.items():
            held = current.get(ap_name)
            if held is None or not _same_ap(held.ap, ap):
                current[ap_name] = ApSession(ap, timeout)


def run(
    config: Config,
    sessions_by_building: Mapping[str, Mapping[str, StationsSource]],
    interval_s: float,
    *,
    on_tick: Callable[[dict[str, TickResult]], None] | None = None,
    max_ticks: int | None = None,
    now: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Tick every building at a fixed interval, forever unless `max_ticks` is given.

    Scheduled against a monotonic clock, anchored at a fixed base (`next_tick += interval_s`
    each pass) rather than `sleep(interval_s)` after each tick: the latter lets a tick's own
    processing time compound into drift every pass, quietly slowing the real poll rate. A
    monotonic clock also can't jump the way wall-clock time can (NTP sync, DST), which would
    otherwise skip or double-fire a tick.

    `on_tick`, `now`, `sleep` are injectable so this is testable without actually waiting or
    running forever -- production code calls this with all three left at their defaults.
    `max_ticks` is what the `--once` CLI flag maps to: run exactly one tick and return.
    """
    next_tick = now()
    ticks_done = 0
    while True:
        results = tick(config, sessions_by_building)
        if on_tick is not None:
            on_tick(results)
        ticks_done += 1
        if max_ticks is not None and ticks_done >= max_ticks:
            return
        next_tick += interval_s
        sleep(max(0.0, next_tick - now()))


def build_readings(
    polled: Sequence[tuple[str, list[Station] | None]],
) -> tuple[list[Reading], set[str]]:
    """Flatten polled per-AP stations into (ap, mac, rssi) readings, plus which APs answered.

    A MAC listed by several APs keeps only its least-idle rows. A station associates with one
    AP; the others still list it for minutes after a roam, its signal frozen where it left.

    A failed AP (`stations is None`) contributes to neither; an AP that heard nobody still
    answered.
    """
    heard: list[tuple[str, Station]] = []
    answered: set[str] = set()
    for ap_name, stations in polled:
        if stations is None:
            continue
        answered.add(ap_name)
        heard.extend((ap_name, station) for station in stations)
    freshest: dict[str, int] = {}
    for _, (mac, _, idle_ms) in heard:
        freshest[mac] = min(idle_ms, freshest.get(mac, idle_ms))
    readings: list[Reading] = [
        (ap_name, mac, rssi)
        for ap_name, (mac, rssi, idle_ms) in heard
        if idle_ms <= freshest[mac] + SAME_AGE_MS
    ]
    return readings, answered
