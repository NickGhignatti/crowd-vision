"""One building's routers as APs, from the rooms telemetry names — no coordinates.

A phone sits in one room at a time: its room's routers hear it strongly, the router of the
neighbouring room it stands near hears it weakly, other neighbours barely, nobody else.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass

from schemas import ApConfig, BuildingStart, ScenarioConfig
from world import World

ROUTER = "router"


@dataclass(frozen=True)
class _Stop:
    room: str
    hold_s: float
    edge: float
    """0 = middle of the room, 1 = at the door to `toward`."""
    toward: str | None


@dataclass(frozen=True)
class _Phone:
    mac: str
    stops: tuple[_Stop, ...]
    offset_s: float
    arrive_h: float
    leave_h: float

    def present_at(self, now_s: float) -> bool:
        local = time.localtime(now_s)
        return self.arrive_h <= local.tm_hour + local.tm_min / 60 < self.leave_h

    def stop_at(self, now_s: float) -> _Stop:
        t = (now_s - self.offset_s) % sum(stop.hold_s for stop in self.stops)
        for stop in self.stops:
            if t < stop.hold_s:
                return stop
            t -= stop.hold_s
        return self.stops[-1]


class BuildingWorld(World):
    """A World whose phones move between rooms instead of along coordinates."""

    def __init__(self, start: BuildingStart, phones_per_room: int, seed: int | None) -> None:
        routers = [s for s in start.sensors if s.sensorType == ROUTER]
        super().__init__(
            ScenarioConfig(
                aps=[ApConfig(id=r.sensorId, zone_id=r.roomId) for r in routers], devices=[]
            ),
            seed,
        )
        # Seeded by building so a restart gets the same neighbours and walks the same people.
        rng = random.Random(start.buildingId)
        rooms = sorted({r.roomId for r in routers})
        self.neighbours = _neighbours(rng, rooms)
        self._gain = {r.sensorId: rng.uniform(-3.0, 3.0) for r in routers}
        self._phones = [
            _phone(rng, rooms, self.neighbours) for _ in range(phones_per_room * len(rooms))
        ]

    @property
    def device_macs(self) -> list[str]:
        return [phone.mac for phone in self._phones]

    def clients(self, ap_id: str, now_s: float | None = None) -> list[tuple[str, int]]:
        """(mac, rssi) for every phone in the building this AP hears."""
        room = self.aps[ap_id].zone_id
        now = now_s if now_s is not None else time.time()
        out: list[tuple[str, int]] = []
        for phone in self._phones:
            if not phone.present_at(now):
                continue
            level = self._level(phone.stop_at(now), room)
            if level is None:
                continue
            signal = level + self._gain[ap_id] + self._rng.gauss(0, self.config.noise_stddev_db)
            if signal >= self.config.sensitivity_dbm:
                out.append((phone.mac, round(signal)))
        return out

    def ground_truth_zone(self, mac: str, now_s: float | None = None) -> str | None:
        """The room the phone is in, or None while it is out of the building."""
        now = now_s if now_s is not None else time.time()
        phone = next((p for p in self._phones if p.mac == mac), None)
        if phone is None or not phone.present_at(now):
            return None
        return phone.stop_at(now).room

    def _level(self, stop: _Stop, room: str) -> float | None:
        if room == stop.room:
            return -45.0 - 12.0 * stop.edge
        if room == stop.toward:
            return -80.0 + 15.0 * stop.edge
        if room in self.neighbours[stop.room]:
            return -82.0
        return None


def simulate(
    start: BuildingStart, phones_per_room: int, seed: int | None = None
) -> BuildingWorld | None:
    """The building's world; None when it has no router to simulate."""
    if not any(s.sensorType == ROUTER for s in start.sensors):
        return None
    return BuildingWorld(start, phones_per_room, seed)


def _neighbours(rng: random.Random, rooms: list[str]) -> dict[str, frozenset[str]]:
    order = rooms[:]
    rng.shuffle(order)
    pairs = list(zip(order, order[1:]))
    if len(order) > 2:
        pairs.append((order[-1], order[0]))
    return {
        room: frozenset(b if a == room else a for a, b in pairs if room in (a, b)) for room in rooms
    }


def _phone(rng: random.Random, rooms: list[str], neighbours: dict[str, frozenset[str]]) -> _Phone:
    room = rng.choice(rooms)
    stops: list[_Stop] = []
    for _ in range(rng.randint(3, 5)):
        near = sorted(neighbours[room])
        stops.append(
            _Stop(
                room=room,
                hold_s=rng.uniform(120.0, 900.0),
                edge=rng.random(),
                toward=rng.choice(near) if near else None,
            )
        )
        room = rng.choice(near) if near and rng.random() < 0.7 else rng.choice(rooms)
    return _Phone(
        mac=_mac(rng),
        stops=tuple(stops),
        offset_s=rng.uniform(0.0, 3600.0),
        arrive_h=rng.gauss(8.5, 1.0),
        leave_h=rng.gauss(17.5, 1.2),
    )


def _mac(rng: random.Random) -> str:
    # Locally administered, as a phone's randomized per-SSID MAC is.
    octets = [0x02] + [rng.randrange(256) for _ in range(5)]
    return ":".join(f"{octet:02x}" for octet in octets)
