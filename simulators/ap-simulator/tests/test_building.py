import json
import time
from pathlib import Path

from building import simulate
from schemas import BuildingStart

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "simulation-start.json"
    ).read_text()
)
TWO_ROOMS = BuildingStart.model_validate(
    next(c for c in _FIXTURE["cases"] if c["consumer"] == "ap-simulator")["body"]
)


def _at(hour: int, minute: int = 0) -> float:
    return time.mktime((2026, 9, 23, hour, minute, 0, 0, 0, -1))


def _routers(*rooms: str) -> BuildingStart:
    return BuildingStart.model_validate(
        {
            "buildingId": "b1",
            "sensors": [
                {"sensorId": f"r{i}", "sensorType": "router", "roomId": room}
                for i, room in enumerate(rooms)
            ],
        }
    )


def _quiet(start: BuildingStart, phones_per_room: int = 6):
    world = simulate(start, phones_per_room=phones_per_room, seed=1)
    assert world is not None
    world.config.noise_stddev_db = 0.0
    return world


def _heard(world, now_s: float) -> dict[str, dict[str, int]]:
    """mac -> router -> rssi, over every router."""
    out: dict[str, dict[str, int]] = {}
    for ap in world.aps:
        for mac, rssi in world.clients(ap, now_s=now_s):
            out.setdefault(mac, {})[ap] = rssi
    return out


def test_each_router_is_an_ap_in_its_room_and_other_kinds_are_ignored():
    body = TWO_ROOMS.model_dump()
    body["sensors"].append({"sensorId": "t1", "sensorType": "temperature", "roomId": "x"})
    world = simulate(BuildingStart.model_validate(body), phones_per_room=4)
    assert world is not None
    assert {(ap.id, ap.zone_id) for ap in world.aps.values()} == {
        (s.sensorId, s.roomId) for s in TWO_ROOMS.sensors
    }


def test_no_router_means_nothing_to_simulate():
    assert simulate(_routers(), phones_per_room=4) is None


def test_a_phone_between_two_routers_is_heard_by_both_louder_in_its_own_room():
    world = _quiet(TWO_ROOMS)
    noon = _at(11)
    both = {mac: by_ap for mac, by_ap in _heard(world, noon).items() if len(by_ap) == 2}
    assert both
    for mac, by_ap in both.items():
        own = world.ground_truth_zone(mac, now_s=noon)
        loudest = max(by_ap, key=lambda ap: by_ap[ap])
        assert world.aps[loudest].zone_id == own


def test_only_a_neighbouring_room_hears_a_phone():
    world = _quiet(_routers("a", "b", "c", "d"))
    noon = _at(11)
    for mac, by_ap in _heard(world, noon).items():
        own = world.ground_truth_zone(mac, now_s=noon)
        assert own is not None
        for ap in by_ap:
            room = world.aps[ap].zone_id
            assert room == own or room in world.neighbours[own]
    assert any(len(near) < 3 for near in world.neighbours.values())


def test_two_routers_in_one_room_hear_the_same_phone_differently():
    world = _quiet(_routers("a", "a"))
    heard = _heard(world, _at(11))
    assert any(len(set(by_ap.values())) == 2 for by_ap in heard.values() if len(by_ap) == 2)


def test_one_building_always_gets_the_same_neighbours_and_people():
    first, again = _quiet(_routers("a", "b", "c", "d")), _quiet(_routers("a", "b", "c", "d"))
    assert first.neighbours == again.neighbours
    noon = _at(11)
    assert {m: first.ground_truth_zone(m, now_s=noon) for m in first.device_macs} == {
        m: again.ground_truth_zone(m, now_s=noon) for m in again.device_macs
    }


def test_phones_move_between_rooms_over_the_day():
    world = _quiet(_routers("a", "b", "c"))
    rooms = {
        mac: {world.ground_truth_zone(mac, now_s=_at(h, m)) for h in range(10, 16) for m in (0, 30)}
        for mac in world.device_macs
    }
    assert any(len(visited - {None}) > 1 for visited in rooms.values())


def test_the_building_empties_at_night():
    world = _quiet(TWO_ROOMS)
    assert len(_heard(world, _at(3))) < len(_heard(world, _at(11)))
