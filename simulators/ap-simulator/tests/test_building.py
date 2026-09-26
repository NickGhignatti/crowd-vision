import json
import math
import time
from pathlib import Path

from building import layout
from schemas import BuildingStart
from world import World

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "simulation-start.json"
    ).read_text()
)


def _start(name_part: str) -> BuildingStart:
    case = next(c for c in _FIXTURE["cases"] if name_part in c["name"])
    return BuildingStart.model_validate(case["body"])


def _at(hour: int) -> float:
    return time.mktime((2026, 9, 23, hour, 0, 0, 0, 0, -1))


PLACED = _start("two placed routers")
UNPLACED = _start("not placed yet")


def test_each_router_becomes_an_ap_in_its_room():
    config = layout(PLACED, devices_per_room=4)
    assert config is not None
    assert {(ap.id, ap.zone_id) for ap in config.aps} == {
        (s.sensorId, s.roomId) for s in PLACED.sensors
    }


def test_a_placed_router_sits_where_the_twin_put_it():
    config = layout(PLACED, devices_per_room=4)
    assert config is not None
    ap = next(ap for ap in config.aps if ap.id == PLACED.sensors[0].sensorId)
    assert (ap.x, ap.y, ap.z) == (3.5, -1.0, 2.6)


def test_an_unplaced_router_hangs_under_its_room_ceiling_at_the_centre():
    config = layout(UNPLACED, devices_per_room=4)
    assert config is not None
    (ap,) = config.aps
    assert (ap.x, ap.y) == (2.0, 0.0)
    assert 2.0 < ap.z < 3.0


def test_other_kinds_get_no_ap_and_no_router_means_nothing_to_simulate():
    body = PLACED.model_dump(exclude_none=True)
    for sensor in body["sensors"]:
        sensor["sensorType"] = "temperature"
    assert layout(BuildingStart.model_validate(body), devices_per_room=4) is None


def test_devices_walk_through_every_room_even_one_without_a_router():
    config = layout(PLACED, devices_per_room=4)
    assert config is not None
    assert len(config.devices) == 4 * len(PLACED.rooms or [])
    corridor = next(r for r in PLACED.rooms or [] if r.roomId == "room-corridor")
    inside = [
        wp
        for d in config.devices
        for wp in d.waypoints
        if abs(wp.x - corridor.position.x) <= corridor.dimensions.width / 2
        and abs(wp.y - corridor.position.z) <= corridor.dimensions.depth / 2
    ]
    assert inside


def test_one_building_always_gets_the_same_layout():
    assert layout(PLACED, devices_per_room=4) == layout(PLACED, devices_per_room=4)


def test_without_rooms_each_router_room_gets_its_own_box():
    body = PLACED.model_dump(exclude_none=True)
    del body["rooms"]
    config = layout(BuildingStart.model_validate(body), devices_per_room=4)
    assert config is not None
    a, b = config.aps
    assert math.dist((a.x, a.y), (b.x, b.y)) > 0
    assert len(config.devices) == 8


def test_a_device_between_two_routers_is_heard_by_both_louder_by_the_nearer():
    config = layout(PLACED, devices_per_room=4)
    assert config is not None
    world = World(config.model_copy(update={"noise_stddev_db": 0.0}), seed=1)
    lab, aula = (s.sensorId for s in PLACED.sensors)
    noon = _at(11)
    heard_lab = dict(world.clients(lab, now_s=noon))
    heard_aula = dict(world.clients(aula, now_s=noon))
    both = heard_lab.keys() & heard_aula.keys()
    assert both
    assert any(heard_lab[mac] != heard_aula[mac] for mac in both)


def test_the_building_empties_at_night():
    config = layout(PLACED, devices_per_room=4)
    assert config is not None
    world = World(config, seed=1)
    heard = {
        hour: {mac for ap in world.aps for mac, _ in world.clients(ap, now_s=_at(hour))}
        for hour in (3, 11)
    }
    assert len(heard[3]) < len(heard[11])
