"""Rooms as digital-twin stores them: axis-aligned boxes, `position` the centre, `y` vertical."""

from __future__ import annotations

import bisect
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

_FLOOR_TOLERANCE_M = 0.5
_WALL_TOLERANCE_M = 0.3
"""Rooms drawn edge to edge rarely share a coordinate exactly: crossings this close are one wall."""


@dataclass(frozen=True)
class Point:
    x: float
    y: float
    z: float

    def distance(self, other: Point) -> float:
        return math.dist((self.x, self.y, self.z), (other.x, other.y, other.z))


@dataclass(frozen=True)
class Room:
    id: str
    centre: Point
    width: float
    height: float
    depth: float

    @property
    def bottom(self) -> float:
        return self.centre.y - self.height / 2

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        """The floor plan as (min_x, min_z, max_x, max_z)."""
        half_w, half_d = self.width / 2, self.depth / 2
        return (
            self.centre.x - half_w,
            self.centre.z - half_d,
            self.centre.x + half_w,
            self.centre.z + half_d,
        )

    def contains(self, p: Point) -> bool:
        min_x, min_z, max_x, max_z = self.bounds
        inside_plan = min_x <= p.x <= max_x and min_z <= p.z <= max_z
        return inside_plan and self.bottom <= p.y <= self.bottom + self.height


@dataclass(frozen=True)
class Router:
    id: str
    room_id: str
    position: Point


class Layout:
    """One building's rooms and routers, and what a signal crosses between two points."""

    def __init__(self, rooms: Sequence[Room], routers: Sequence[Router]) -> None:
        self.rooms = {room.id: room for room in rooms}
        self.routers = {router.id: router for router in routers}
        self._floors = _floor_bottoms(rooms)
        self._by_floor: dict[int, list[Room]] = {}
        for room in rooms:
            self._by_floor.setdefault(self.floor_of(room.bottom), []).append(room)

    @classmethod
    def of(
        cls,
        rooms: Sequence[Room],
        routers: Sequence[tuple[str, str]],
        placements: Mapping[str, Point] | None,
    ) -> Layout:
        """Routers where the twin placed them, else at their room's centre; unknown rooms dropped."""
        known = {room.id: room for room in rooms}
        placed = placements or {}
        return cls(
            rooms,
            [
                Router(sensor_id, room_id, placed.get(sensor_id, known[room_id].centre))
                for sensor_id, room_id in routers
                if room_id in known
            ],
        )

    @property
    def footprint(self) -> tuple[float, float, float, float]:
        """The building's plan as (min_x, min_z, max_x, max_z)."""
        bounds = [room.bounds for room in self.rooms.values()]
        return (
            min(b[0] for b in bounds),
            min(b[1] for b in bounds),
            max(b[2] for b in bounds),
            max(b[3] for b in bounds),
        )

    @property
    def ground(self) -> float:
        return self._floors[0] if self._floors else 0.0

    def floor_of(self, y: float) -> int:
        return max(0, bisect.bisect_right(self._floors, y + 0.01) - 1)

    def rooms_on(self, floor: int) -> list[Room]:
        return self._by_floor.get(floor, [])

    def room_at(self, p: Point) -> Room | None:
        return next((room for room in self.rooms_on(self.floor_of(p.y)) if room.contains(p)), None)

    def slabs_between(self, a: Point, b: Point) -> int:
        return abs(self.floor_of(a.y) - self.floor_of(b.y))

    def walls_between(self, a: Point, b: Point) -> int:
        """Walls a straight path from `a` to `b` crosses, on `a`'s floor plan."""
        length = math.hypot(b.x - a.x, b.z - a.z)
        if length == 0:
            return 0
        crossings = sorted(
            t * length
            for room in self.rooms_on(self.floor_of(a.y))
            for t in _crossings(room.bounds, a, b)
        )
        walls, last = 0, -math.inf
        for at in crossings:
            if at - last > _WALL_TOLERANCE_M:
                walls += 1
            last = at
        return walls


def _floor_bottoms(rooms: Sequence[Room]) -> list[float]:
    bottoms: list[float] = []
    for bottom in sorted(room.bottom for room in rooms):
        if not bottoms or bottom - bottoms[-1] > _FLOOR_TOLERANCE_M:
            bottoms.append(bottom)
    return bottoms


def _crossings(bounds: tuple[float, float, float, float], a: Point, b: Point) -> list[float]:
    """Where, as a fraction of `a`→`b`, the path crosses this outline (Liang–Barsky clipping)."""
    min_x, min_z, max_x, max_z = bounds
    dx, dz = b.x - a.x, b.z - a.z
    t_in, t_out = -math.inf, math.inf
    for p, q in ((-dx, a.x - min_x), (dx, max_x - a.x), (-dz, a.z - min_z), (dz, max_z - a.z)):
        if p == 0:
            if q < 0:
                return []
            continue
        t = q / p
        if p < 0:
            t_in = max(t_in, t)
        else:
            t_out = min(t_out, t)
    if t_in > t_out:
        return []
    return [t for t in (t_in, t_out) if 0.0 < t < 1.0]
