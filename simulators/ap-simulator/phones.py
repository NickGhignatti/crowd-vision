"""People in and around a building as pure functions of time: where, screen lit or not, when they scan.

Pure so a restart, or two routers asking about the same instant, always agree.
"""

from __future__ import annotations

import hashlib
import math
import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import cached_property

from config import SimConfig
from geometry import Layout, Point, Room
from physics import uniform

WALK_MPS = 1.2
HAND_HEIGHT_M = 1.2
_WALL_MARGIN_M = 0.5
_PASSERBY_OFFSET_M = (2.0, 15.0)
_PASSERBY_OVERSHOOT_M = 10.0


@dataclass(frozen=True)
class Stop:
    room_id: str
    point: Point
    hold_s: float


@dataclass(frozen=True)
class Phone:
    mac: str
    stops: tuple[Stop, ...]
    offset_s: float
    arrive_h: float
    leave_h: float
    gain_db: float

    def present_at(self, now_s: float) -> bool:
        local = time.localtime(now_s)
        return self.arrive_h <= local.tm_hour + local.tm_min / 60 < self.leave_h

    def where(self, now_s: float) -> tuple[Point, bool]:
        """Where the phone is, and whether it is walking between two stops."""
        t = (now_s - self.offset_s) % self._cycle_s
        for here, there in self._legs:
            if t < here.hold_s:
                return here.point, False
            t -= here.hold_s
            travel = _travel_s(here.point, there.point)
            if t < travel:
                return _between(here.point, there.point, t / travel), True
            t -= travel
        return self.stops[0].point, False

    @cached_property
    def _legs(self) -> list[tuple[Stop, Stop]]:
        return list(zip(self.stops, self.stops[1:] + self.stops[:1]))

    @cached_property
    def _cycle_s(self) -> float:
        return sum(a.hold_s + _travel_s(a.point, b.point) for a, b in self._legs)


@dataclass(frozen=True)
class Passerby:
    """Someone walking past outside: heard through the walls, never on the building's Wi-Fi."""

    id: str
    start: Point
    end: Point
    t0: float
    gain_db: float

    @property
    def t1(self) -> float:
        return self.t0 + _travel_s(self.start, self.end)

    def where(self, now_s: float) -> Point | None:
        if not self.t0 <= now_s <= self.t1:
            return None
        return _between(self.start, self.end, (now_s - self.t0) / (self.t1 - self.t0))


def make_phone(rng: random.Random, layout: Layout, config: SimConfig) -> Phone:
    """A phone that visits 3–5 spots, mostly on one floor, through rooms with or without routers."""
    rooms = sorted(layout.rooms)
    room = rng.choice(rooms)
    stops: list[Stop] = []
    for _ in range(rng.randint(3, 5)):
        stops.append(Stop(room, _spot(rng, layout.rooms[room]), rng.uniform(120.0, 900.0)))
        floor = layout.floor_of(layout.rooms[room].bottom)
        same_floor = [r for r in rooms if layout.floor_of(layout.rooms[r].bottom) == floor]
        room = rng.choice(same_floor) if rng.random() < 0.8 else rng.choice(rooms)
    spread = config.phone_gain_spread_db
    return Phone(
        mac=random_mac(rng),
        stops=tuple(stops),
        offset_s=rng.uniform(0.0, 3600.0),
        arrive_h=rng.gauss(8.5, 1.0),
        leave_h=rng.gauss(17.5, 1.2),
        gain_db=rng.uniform(-spread, spread),
    )


def random_mac(rng: random.Random) -> str:
    """Locally administered unicast, as a phone's per-SSID private address is."""
    return _format_mac(
        [(rng.randrange(256) & 0xFC) | 0x02, *(rng.randrange(256) for _ in range(5))]
    )


def passersby(seed: str, layout: Layout, hour: int, config: SimConfig) -> list[Passerby]:
    """The people walking along the outside of the building during one hour since the epoch."""
    rng = random.Random(f"{seed}:passersby:{hour}")
    min_x, min_z, max_x, max_z = layout.footprint
    y, over = layout.ground + HAND_HEIGHT_M, _PASSERBY_OVERSHOOT_M
    walkers: list[Passerby] = []
    for i in range(config.passersby_per_hour):
        offset = rng.uniform(*_PASSERBY_OFFSET_M)
        side = rng.randrange(4)
        if side < 2:
            z = min_z - offset if side == 0 else max_z + offset
            start, end = Point(min_x - over, y, z), Point(max_x + over, y, z)
        else:
            x = min_x - offset if side == 2 else max_x + offset
            start, end = Point(x, y, min_z - over), Point(x, y, max_z + over)
        if rng.random() < 0.5:
            start, end = end, start
        spread = config.phone_gain_spread_db
        walkers.append(
            Passerby(
                f"passerby-{hour}-{i}",
                start,
                end,
                hour * 3600.0 + rng.uniform(0.0, 3600.0),
                rng.uniform(-spread, spread),
            )
        )
    return walkers


def screen_on(key: str, now_s: float, walking: bool, config: SimConfig) -> bool:
    lit = config.screen_on_walking if walking else config.screen_on_dwelling
    return uniform(key, "screen", int(now_s // config.screen_bucket_s)) < lit


def bursts(
    key: str, t0: float, t1: float, lit: Callable[[float], bool], config: SimConfig
) -> list[tuple[int, float]]:
    """(slot, time) of every scan burst in [t0, t1): at most one per slot, likelier while lit."""
    slot_s = config.scan_slot_s
    found: list[tuple[int, float]] = []
    for slot in range(math.floor(t0 / slot_s), math.ceil(t1 / slot_s) + 1):
        start = slot * slot_s
        interval = config.scan_interval_on_s if lit(start) else config.scan_interval_off_s
        if uniform(key, "scan", slot) >= min(1.0, slot_s / interval):
            continue
        at = start + uniform(key, "at", slot) * slot_s
        if t0 <= at < t1:
            found.append((slot, at))
    return found


def burst_mac(key: str, slot: int, own: str, random_fraction: float) -> str:
    """The source address of one burst: a fresh private one, or the phone's own."""
    if uniform(key, "private", slot) >= random_fraction:
        return own
    digest = hashlib.blake2b(repr((key, "mac", slot)).encode(), digest_size=6).digest()
    return _format_mac([(digest[0] & 0xFC) | 0x02, *digest[1:]])


def _format_mac(octets: list[int]) -> str:
    return ":".join(f"{octet:02x}" for octet in octets)


def _spot(rng: random.Random, room: Room) -> Point:
    half_w = max(0.0, room.width / 2 - _WALL_MARGIN_M)
    half_d = max(0.0, room.depth / 2 - _WALL_MARGIN_M)
    return Point(
        room.centre.x + rng.uniform(-half_w, half_w),
        room.bottom + min(HAND_HEIGHT_M, room.height / 2),
        room.centre.z + rng.uniform(-half_d, half_d),
    )


def _travel_s(a: Point, b: Point) -> float:
    return a.distance(b) / WALK_MPS


def _between(a: Point, b: Point, fraction: float) -> Point:
    return Point(
        a.x + (b.x - a.x) * fraction,
        a.y + (b.y - a.y) * fraction,
        a.z + (b.z - a.z) * fraction,
    )
