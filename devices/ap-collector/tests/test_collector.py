import pytest

from app.collector import batch_poll_by_building, build_readings, poll_aps, poll_one
from app.config import AccessPoint, Building
from app.ubus import UbusError


class _FakeSession:
    def __init__(self, result=None, error=None):
        self._result = result
        self._error = error

    def stations(self):
        if self._error is not None:
            raise self._error
        return self._result


def test_poll_one_returns_stations_on_success():
    session = _FakeSession(result=[("aa:bb:cc:00:00:01", -60)])

    result = poll_one("ap-a", session)

    assert result == ("ap-a", [("aa:bb:cc:00:00:01", -60)])


def test_poll_one_returns_none_on_ubus_error():
    session = _FakeSession(error=UbusError("boom"))

    result = poll_one("ap-a", session)

    assert result == ("ap-a", None)


def test_poll_one_does_not_swallow_unrelated_exceptions():
    class _BoomError(Exception):
        pass

    session = _FakeSession(error=_BoomError("not a ubus error"))

    with pytest.raises(_BoomError):
        poll_one("ap-a", session)


def test_poll_aps_polls_each_ap_with_its_own_session():
    session_a = _FakeSession(result=[("aa:bb:cc:00:00:01", -60)])
    session_b = _FakeSession(result=[("aa:bb:cc:00:00:02", -70)])

    result = poll_aps({"ap-a": session_a, "ap-b": session_b})

    assert sorted(result) == [
        ("ap-a", [("aa:bb:cc:00:00:01", -60)]),
        ("ap-b", [("aa:bb:cc:00:00:02", -70)]),
    ]


def test_poll_aps_returns_none_for_a_failed_ap_without_affecting_others():
    session_a = _FakeSession(result=[("aa:bb:cc:00:00:01", -60)])
    session_b = _FakeSession(error=UbusError("ap-b down"))

    result = poll_aps({"ap-a": session_a, "ap-b": session_b})

    assert sorted(result) == [
        ("ap-a", [("aa:bb:cc:00:00:01", -60)]),
        ("ap-b", None),
    ]


def test_build_readings_flattens_stations_with_ap_name_attached():
    polled = [("ap-a", [("aa:bb:cc:00:00:01", -60), ("aa:bb:cc:00:00:02", -70)])]
    ap_zones = {"ap-a": "lobby"}

    readings, available = build_readings(polled, ap_zones)

    assert sorted(readings) == [
        ("ap-a", "aa:bb:cc:00:00:01", -60),
        ("ap-a", "aa:bb:cc:00:00:02", -70),
    ]
    assert available == {"lobby"}


def test_build_readings_excludes_failed_aps_from_readings_and_availability():
    polled = [("ap-a", None)]
    ap_zones = {"ap-a": "lobby"}

    readings, available = build_readings(polled, ap_zones)

    assert readings == []
    assert available == set()


def test_build_readings_zone_stays_available_when_ap_heard_nobody():
    polled = [("ap-a", [])]
    ap_zones = {"ap-a": "lobby"}

    readings, available = build_readings(polled, ap_zones)

    assert readings == []
    assert available == {"lobby"}


def test_build_readings_zone_available_if_any_of_its_aps_answered():
    polled = [("ap-a", None), ("ap-b", [])]
    ap_zones = {"ap-a": "lobby", "ap-b": "lobby"}

    _, available = build_readings(polled, ap_zones)

    assert available == {"lobby"}


def test_build_readings_does_not_filter_unmapped_ap_readings_itself():
    """best_by_zone already drops unmapped-AP readings -- build_readings doesn't
    duplicate that rule, it only skips the AP for `available_zones`."""
    polled = [("ap-x", [("aa:bb:cc:00:00:01", -50)])]

    readings, available = build_readings(polled, ap_zones={})

    assert readings == [("ap-x", "aa:bb:cc:00:00:01", -50)]
    assert available == set()


def _ap(**overrides):
    fields = {
        "name": "ap-a",
        "zone": "zone-a",
        "url": "http://x",
        "username": "u",
        "password": "p",
        "ifaces": ["wlan0"],
        "reader": "hostapd",
    }
    fields.update(overrides)
    return AccessPoint(**fields)


def test_batch_poll_by_building_derives_zones_from_the_building_config():
    building = Building(
        name="b1", ap=[_ap(name="ap-a", zone="lobby"), _ap(name="ap-b", zone="hall")]
    )
    sessions = {
        "ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -60)]),
        "ap-b": _FakeSession(result=[]),
    }

    readings, available = batch_poll_by_building(building, sessions)

    assert readings == [("ap-a", "aa:bb:cc:00:00:01", -60)]
    assert available == {"lobby", "hall"}


def test_batch_poll_by_building_zone_stays_available_via_the_other_ap():
    building = Building(
        name="b1", ap=[_ap(name="ap-a", zone="lobby"), _ap(name="ap-b", zone="lobby")]
    )
    sessions = {
        "ap-a": _FakeSession(error=UbusError("ap-a down")),
        "ap-b": _FakeSession(result=[]),
    }

    _, available = batch_poll_by_building(building, sessions)

    assert available == {"lobby"}
