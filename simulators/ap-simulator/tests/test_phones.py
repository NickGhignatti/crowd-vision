import time

import pytest

from config import SimConfig
from geometry import Layout, Point, Room
from phones import Phone, Stop, burst_mac, bursts, passersby, screen_on

CONFIG = SimConfig()
A, B = Point(0.0, 1.2, 0.0), Point(12.0, 1.2, 0.0)


def _at(hour: int) -> float:
    return time.mktime((2026, 9, 23, hour, 0, 0, 0, 0, -1))


def _phone(arrive_h: float = 0.0, leave_h: float = 24.0) -> Phone:
    stops = (Stop("a", A, 10.0), Stop("b", B, 10.0))
    return Phone("02:00:00:00:00:01", stops, 0.0, arrive_h, leave_h, 0.0)


def test_a_phone_holds_at_each_stop_and_walks_between_them_at_walking_speed():
    phone = _phone()
    assert phone.where(5.0) == (A, False)
    halfway, walking = phone.where(15.0)
    assert walking and halfway.x == pytest.approx(6.0) and halfway.z == 0.0
    assert phone.where(25.0) == (B, False)
    assert phone.where(45.0) == (A, False)


def test_a_phone_is_in_the_building_only_during_its_hours():
    phone = _phone(arrive_h=8.5, leave_h=17.5)
    assert phone.present_at(_at(12))
    assert not phone.present_at(_at(3))


def test_screens_are_lit_about_as_often_as_configured():
    lit = sum(screen_on("p", b * CONFIG.screen_bucket_s, False, CONFIG) for b in range(5000))
    assert abs(lit / 5000 - CONFIG.screen_on_dwelling) < 0.03


def test_a_lit_screen_scans_far_more_often_than_a_dark_one():
    day = 86_400.0
    lit = bursts("p", 0.0, day, lambda _t: True, CONFIG)
    dark = bursts("p", 0.0, day, lambda _t: False, CONFIG)
    expected = day / CONFIG.scan_interval_on_s
    assert abs(len(lit) - expected) < 0.15 * expected
    assert len(lit) > 8 * len(dark)


def test_the_scan_schedule_does_not_depend_on_how_the_window_is_cut():
    def lit(_t: float) -> bool:
        return True

    whole = bursts("p", 0.0, 3600.0, lit, CONFIG)
    halves = bursts("p", 0.0, 1800.0, lit, CONFIG) + bursts("p", 1800.0, 3600.0, lit, CONFIG)
    assert whole == halves
    assert all(0.0 <= at < 3600.0 for _slot, at in whole)


def test_a_random_burst_mac_is_locally_administered_unicast_and_never_the_phones_own():
    own = "02:aa:bb:cc:dd:ee"
    macs = {burst_mac("p", slot, own, 1.0) for slot in range(200)}
    assert own not in macs and len(macs) == 200
    assert all(int(mac[:2], 16) & 0b11 == 0b10 for mac in macs)
    assert burst_mac("p", 3, own, 0.0) == own


def test_passersby_walk_outside_the_walls_every_hour():
    layout = Layout([Room("a", Point(5.0, 1.5, 5.0), 10.0, 3.0, 10.0)], [])
    hour = int(_at(12) // 3600)
    walkers = passersby("b1", layout, hour, SimConfig(passersby_per_hour=12))
    assert len(walkers) == 12
    min_x, min_z, max_x, max_z = layout.footprint
    for walker in walkers:
        assert walker.where(walker.t0 - 1.0) is None
        mid = walker.where((walker.t0 + walker.t1) / 2)
        assert mid is not None
        assert not (min_x <= mid.x <= max_x and min_z <= mid.z <= max_z)
