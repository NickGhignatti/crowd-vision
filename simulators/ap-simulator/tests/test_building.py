import time

from building import BuildingWorld, Station, next_association
from config import SimConfig
from geometry import Layout, Point, Room

ROOMS = [
    Room(rid, Point(5.0 + 10.0 * i, 1.5, 5.0), 10.0, 3.0, 10.0) for i, rid in enumerate("abcd")
]


def _at(hour: int, minute: int = 0) -> float:
    return time.mktime((2026, 9, 23, hour, minute, 0, 0, 0, -1))


NOON = _at(12)


def _world(rooms_with_routers: str = "abcd", **config) -> BuildingWorld:
    layout = Layout.of(ROOMS, [(f"r-{room}", room) for room in rooms_with_routers], None)
    return BuildingWorld("b1", layout, SimConfig(**config))


def _listed(world: BuildingWorld, now: float) -> dict[str, list[tuple[str, Station]]]:
    out: dict[str, list[tuple[str, Station]]] = {}
    for ap in world.aps:
        for station in world.clients(ap, now):
            out.setdefault(station.mac, []).append((ap, station))
    return out


def _probes(world: BuildingWorld, t0: float, t1: float):
    return [(ap, e) for ap in world.aps for e in world.events(ap, t0, t1) if e.kind == "probe"]


def test_a_phone_joins_the_loudest_router_and_sticks_until_its_link_degrades():
    cfg = SimConfig()
    assert next_association(None, {"a": -60.0, "b": -50.0}, cfg) == "b"
    assert next_association(None, {"a": -85.0}, cfg) is None
    assert next_association("a", {"a": -65.0, "b": -40.0}, cfg) == "a"
    assert next_association("a", {"a": -75.0, "b": -66.0}, cfg) == "b"
    assert next_association("a", {"a": -75.0, "b": -68.0}, cfg) == "a"
    assert next_association("a", {"a": -90.0, "b": -60.0}, cfg) is None


def test_a_router_lists_only_the_phones_associated_to_it():
    world = _world()
    for now in (NOON, NOON + 300, NOON + 900):
        listed = _listed(world, now)
        assert all(sum(not s.stale for _, s in rows) <= 1 for rows in listed.values())
        present = [p["mac"] for p in world.ground_truth(now)["phones"] if p["present"]]
        active = {mac for mac, rows in listed.items() if any(not s.stale for _, s in rows)}
        assert present and len(active) >= 0.9 * len(present)


def test_a_roam_leaves_a_stale_entry_with_frozen_readings_until_inactivity_expires():
    world = _world()
    cfg = world.config
    for minute in range(240):
        now = NOON + 60 * minute
        stale = [(ap, s) for ap in world.aps for s in world.clients(ap, now) if s.stale]
        later = {(ap, s.mac): s for ap in world.aps for s in world.clients(ap, now + 60)}
        kept = [(ap, s, later[(ap, s.mac)]) for ap, s in stale if (ap, s.mac) in later]
        kept = [(ap, s, nxt) for ap, s, nxt in kept if nxt.stale]
        if kept:
            break
    else:
        raise AssertionError("no phone ever roamed")
    ap, before, after = kept[0]
    assert (after.signal, after.rx_packets, after.tx_packets) == (
        before.signal,
        before.rx_packets,
        before.tx_packets,
    )
    assert abs(after.inactive_ms - before.inactive_ms - 60_000) <= 1
    expired = now + cfg.ap_max_inactivity_s + cfg.assoc_step_s
    assert all(s.mac != before.mac or not s.stale for s in world.clients(ap, expired))


def test_the_building_is_empty_at_night():
    world = _world()
    assert not any(world.clients(ap, _at(3)) for ap in world.aps)


def test_a_phone_that_left_is_still_listed_for_a_while_like_a_real_station_table():
    world = _world()
    for minute in range(0, 6 * 60, 2):
        now = _at(15) + 60 * minute
        gone = {p["mac"] for p in world.ground_truth(now)["phones"] if not p["present"]}
        if gone & set(_listed(world, now)):
            return
    raise AssertionError("no departed phone was ever still listed")


def test_one_scan_burst_reaches_several_routers_under_one_mac_within_the_sweep():
    world = _world(passersby_per_hour=0)
    heard: dict[str, list[tuple[str, float]]] = {}
    for ap, event in _probes(world, NOON, NOON + 600):
        heard.setdefault(event.payload["address"], []).append((ap, event.at))
    assert any(len({ap for ap, _ in rows}) >= 3 for rows in heard.values())
    for rows in heard.values():
        times = [at for _, at in rows]
        assert max(times) - min(times) <= world.config.burst_spread_s + 0.1


def test_burst_macs_are_random_unless_configured_to_be_the_phones_own():
    randomised = _world(passersby_per_hour=0)
    addresses = {e.payload["address"] for _, e in _probes(randomised, NOON, NOON + 600)}
    assert addresses and not addresses & set(randomised.device_macs)

    own = _world(passersby_per_hour=0, probe_random_mac_fraction=0.0)
    addresses = {e.payload["address"] for _, e in _probes(own, NOON, NOON + 600)}
    assert addresses and addresses <= set(own.device_macs)


def test_passersby_are_heard_through_the_walls_but_never_join():
    world = _world(phones_per_room=0, passersby_per_hour=60)
    assert _probes(world, NOON, NOON + 3600)
    assert not any(world.clients(ap, NOON + 3600) for ap in world.aps)


def test_ground_truth_names_the_sender_of_every_probe():
    world = _world()
    probes = _probes(world, NOON, NOON + 300)
    window = 300 + world.config.burst_spread_s
    senders = {b["address"] for b in world.ground_truth(NOON + 300, window_s=window)["bursts"]}
    assert probes and all(e.payload["address"] in senders for _, e in probes)


def test_one_building_always_gets_the_same_people_in_the_same_places():
    first, again = _world(), _world()
    assert first.device_macs == again.device_macs
    assert first.ground_truth(NOON)["phones"] == again.ground_truth(NOON)["phones"]


def test_people_also_spend_time_in_rooms_without_a_router():
    world = _world(rooms_with_routers="ad")
    rooms = {p["roomId"] for h in range(9, 17) for p in world.ground_truth(_at(h))["phones"]}
    assert rooms & {"b", "c"}
