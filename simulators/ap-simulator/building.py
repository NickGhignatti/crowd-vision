"""Turns telemetry's start body into a World: one AP per router, people walking the rooms.

The twin is y-up; the World's floor plane is (x, y) with z as height, so twin (x, y, z)
maps to World (x, z, y).
"""

from __future__ import annotations

import random

from schemas import (
    ApConfig,
    BuildingStart,
    Coordinates,
    DeviceRoute,
    Dimensions,
    Room,
    ScenarioConfig,
    SimulatedSensor,
    Waypoint,
)

ROUTER = "router"
PHONE_HEIGHT_M = 1.2
CEILING_GAP_M = 0.3
WALL_MARGIN_M = 0.5
FALLBACK_ROOM = Dimensions(width=8.0, height=3.0, depth=8.0)


def layout(start: BuildingStart, devices_per_room: int) -> ScenarioConfig | None:
    """The building's APs and devices; None when it has no router to simulate."""
    routers = [s for s in start.sensors if s.sensorType == ROUTER]
    if not routers:
        return None
    # Without rooms a twin position has nothing to be measured against, so it is ignored.
    geometry = start.rooms is not None
    rooms = start.rooms or _fallback_rooms(routers)
    by_id = {room.roomId: room for room in rooms}
    aps = [
        _ap(router, by_id[router.roomId], geometry) for router in routers if router.roomId in by_id
    ]
    # Seeded by building so a restart walks the same people through the same rooms.
    rng = random.Random(start.buildingId)
    devices = [_device(rng, rooms) for _ in range(devices_per_room * len(rooms))]
    return ScenarioConfig(aps=aps, devices=devices)


def _fallback_rooms(routers: list[SimulatedSensor]) -> list[Room]:
    room_ids = sorted({router.roomId for router in routers})
    return [
        Room(
            roomId=room_id,
            position=Coordinates(x=index * FALLBACK_ROOM.width, y=0.0, z=0.0),
            dimensions=FALLBACK_ROOM,
        )
        for index, room_id in enumerate(room_ids)
    ]


def _ap(router: SimulatedSensor, room: Room, geometry: bool) -> ApConfig:
    at = router.position if geometry and router.position is not None else None
    if at is None:
        ceiling = room.position.y + room.dimensions.height - CEILING_GAP_M
        at = Coordinates(x=room.position.x, y=ceiling, z=room.position.z)
    return ApConfig(id=router.sensorId, zone_id=router.roomId, x=at.x, y=at.z, z=at.y)


def _device(rng: random.Random, rooms: list[Room]) -> DeviceRoute:
    stops = [rng.choice(rooms) for _ in range(rng.randint(2, 4))]
    return DeviceRoute(
        mac=_mac(rng),
        waypoints=[_spot(rng, room, hold_s=rng.uniform(120.0, 900.0)) for room in stops],
        speed_mps=rng.uniform(0.9, 1.4),
        phase_offset_s=rng.uniform(0.0, 3600.0),
        present_h=(rng.gauss(8.5, 1.0), rng.gauss(17.5, 1.2)),
    )


def _spot(rng: random.Random, room: Room, hold_s: float) -> Waypoint:
    def along(centre: float, side: float) -> float:
        reach = max(side / 2 - WALL_MARGIN_M, 0.0)
        return rng.uniform(centre - reach, centre + reach)

    return Waypoint(
        x=along(room.position.x, room.dimensions.width),
        y=along(room.position.z, room.dimensions.depth),
        z=room.position.y + PHONE_HEIGHT_M,
        hold_s=hold_s,
    )


def _mac(rng: random.Random) -> str:
    # Locally administered, as a phone's randomized per-SSID MAC is.
    octets = [0x02] + [rng.randrange(256) for _ in range(5)]
    return ":".join(f"{octet:02x}" for octet in octets)
