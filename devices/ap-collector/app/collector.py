"""One tick of the collector: poll every AP, safely.

Called once per interval by the run loop (not yet written). Each AP's failure is caught
here so it can never crash the shared tick -- one broken radio must not take down the
whole building's read.
"""

from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from app.ubus import ApSession, UbusError
from app.zones import ZoneTracker, best_by_zone

if TYPE_CHECKING:
    from collections import Counter
    from collections.abc import Callable, Mapping, Sequence

    from app.config import Building, Config
    from app.ubus import StationsSource
    from app.zones import Reading


def poll_one(ap_name: str, session: StationsSource) -> tuple[str, list[tuple[str, int]] | None]:
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
    sessions: Mapping[str, StationsSource],
) -> list[tuple[str, list[tuple[str, int]] | None]]:
    """Poll every AP, each with its own session, returning their stations or None if they failed.

    All at once, and that is a budget decision rather than a speed one: polled in sequence, a
    tick costs the *sum* of its APs' timeouts, so enough unreachable APs push one tick past
    `pollIntervalS` and the run loop -- which never sleeps a negative amount -- quietly settles
    at a slower real poll rate than the hysteresis numbers were tuned against. Concurrently, a
    tick costs about one timeout however many APs are dark, which is what `Config._validate`'s
    `requestTimeoutS <= pollIntervalS` check assumes.

    Every AP has its own session and the sessions share nothing, so there is nothing to lock.
    `map` preserves `sessions` order.
    """
    if not sessions:
        return []
    with ThreadPoolExecutor(max_workers=len(sessions)) as pool:
        return list(pool.map(lambda item: poll_one(*item), sessions.items()))


def _ap_zones(building: Building) -> dict[str, str]:
    return {ap.name: ap.zone for ap in building.ap}


def batch_poll_by_building(
    building: Building, sessions: Mapping[str, StationsSource]
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
    building: Building, sessions: Mapping[str, StationsSource], tracker: ZoneTracker
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
    sessions_by_building: Mapping[str, Mapping[str, StationsSource]],
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
    config: Config, polls: int, margin_db: float, absent_polls: int, frozen_polls: int
) -> dict[str, ZoneTracker]:
    """One ZoneTracker per building -- built once for the whole run, same reasoning as
    `build_sessions`: hysteresis state must survive across ticks to mean anything."""
    return {
        building.name: ZoneTracker(polls, margin_db, absent_polls, frozen_polls)
        for building in config.buildings
    }


def run(
    config: Config,
    sessions_by_building: Mapping[str, Mapping[str, StationsSource]],
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


def readings_for_building(
    building: Building,
    assignment: Mapping[str, str],
    now_ms: int,
    devices_per_person: float | None = None,
) -> list[dict[str, str | int]]:
    """Confirmed per-device zone assignment -> the tick's occupancy readings per declared zone.

    Two metrics, not one. `totalDeviceCount` is the measurement; `ratioDeviceCount` is that
    count divided by the site's devices-per-person factor, which is an estimate.

    `devices_per_person` is opt-in (None means off, matching Config.devices_per_person). With
    no factor configured there is no estimate to publish, and an estimate silently equal to
    the device count would be a claim about people that nobody made.

    The division rounds *up*: one device under a factor of 2.5 is 0.4 of a person, and
    rounding that to zero reports an occupied room as empty -- indistinguishable downstream
    from the real emptiness the paragraph above is careful to preserve. Ceiling keeps 0 at 0
    and never erases somebody who is standing there.
    """
    counts = dict.fromkeys(set(_ap_zones(building).values()), 0)
    for zone in assignment.values():
        counts[zone] = counts.get(zone, 0) + 1

    readings: list[dict[str, str | int]] = [
        _reading("totalDeviceCount", zone, now_ms, count) for zone, count in counts.items()
    ]
    if devices_per_person is not None:
        readings += [
            _reading("ratioDeviceCount", zone, now_ms, math.ceil(count / devices_per_person))
            for zone, count in counts.items()
        ]
    return readings


def _reading(metric: str, zone: str, now_ms: int, value: int) -> dict[str, str | int]:
    """One telemetry reading. The value field is named after the metric, matching every
    plugin in `backend/telemetry/src/plugins` -- `MetricDescriptor.value_field` == `key`."""
    return {"type": metric, "roomId": zone, "timestamp": now_ms, metric: value}


def build_readings(
    polled: Sequence[tuple[str, list[tuple[str, int]] | None]],
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
