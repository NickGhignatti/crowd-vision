from collections import Counter

import pytest

from app.collector import (
    batch_poll_by_building,
    build_readings,
    build_sessions,
    build_trackers,
    poll_aps,
    poll_one,
    readings_for_building,
    run,
    tick,
    tick_building,
)
from app.config import AccessPoint, Building, Config
from app.ubus import ApSession, UbusError
from app.zones import ZoneTracker


class _FakeSession:
    def __init__(
        self, result: list[tuple[str, int]] | None = None, error: Exception | None = None
    ) -> None:
        self._result = result
        self._error = error

    def stations(self) -> list[tuple[str, int]]:
        if self._error is not None:
            raise self._error
        assert self._result is not None
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


def test_tick_building_first_sighting_is_not_a_transition():
    building = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    sessions = {"ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -60)])}
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1)

    assignment, moves = tick_building(building, sessions, tracker)

    assert assignment == {"aa:bb:cc:00:00:01": "lobby"}
    assert moves == Counter()


def test_tick_building_confirms_move_across_two_ticks():
    building = Building(
        name="b1",
        ap=[_ap(name="ap-lobby", zone="lobby"), _ap(name="ap-hall", zone="hall")],
    )
    tracker = ZoneTracker(polls=1, margin_db=5, absent_polls=1)

    tick_building(
        building,
        {
            "ap-lobby": _FakeSession(result=[("aa:bb:cc:00:00:01", -50)]),
            "ap-hall": _FakeSession(result=[]),
        },
        tracker,
    )

    assignment, moves = tick_building(
        building,
        {
            "ap-lobby": _FakeSession(result=[]),
            "ap-hall": _FakeSession(result=[("aa:bb:cc:00:00:01", -40)]),
        },
        tracker,
    )

    assert assignment == {"aa:bb:cc:00:00:01": "hall"}
    assert moves == Counter({("lobby", "hall"): 1})


def test_tick_building_freezes_when_an_ap_fails_this_tick():
    building = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1)
    tick_building(building, {"ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -60)])}, tracker)

    assignment, moves = tick_building(
        building, {"ap-a": _FakeSession(error=UbusError("down"))}, tracker
    )

    assert assignment == {"aa:bb:cc:00:00:01": "lobby"}
    assert moves == Counter()


def test_tick_processes_every_building_independently():
    building1 = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    building2 = Building(name="b2", ap=[_ap(name="ap-x", zone="lobby")])  # same zone name
    config = Config([building1, building2])
    sessions_by_building = {
        "b1": {"ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -60)])},
        "b2": {"ap-x": _FakeSession(result=[("aa:bb:cc:00:00:02", -70)])},
    }
    trackers_by_building = {
        "b1": ZoneTracker(polls=1, margin_db=0, absent_polls=1),
        "b2": ZoneTracker(polls=1, margin_db=0, absent_polls=1),
    }

    results = tick(config, sessions_by_building, trackers_by_building)

    assert results["b1"] == ({"aa:bb:cc:00:00:01": "lobby"}, Counter())
    assert results["b2"] == ({"aa:bb:cc:00:00:02": "lobby"}, Counter())


def test_build_sessions_creates_one_session_per_ap_grouped_by_building():
    building1 = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    building2 = Building(name="b2", ap=[_ap(name="ap-x", zone="hall")])
    config = Config([building1, building2])

    sessions = build_sessions(config, timeout=3)

    assert set(sessions) == {"b1", "b2"}
    assert set(sessions["b1"]) == {"ap-a"}
    session = sessions["b1"]["ap-a"]
    assert isinstance(session, ApSession)
    assert session.ap is building1.ap[0]
    assert session.timeout == 3


def test_build_trackers_creates_one_tracker_per_building_with_the_given_parameters():
    building1 = Building(name="b1", ap=[_ap()])
    building2 = Building(name="b2", ap=[_ap()])
    config = Config([building1, building2])

    trackers = build_trackers(config, polls=2, margin_db=6.0, absent_polls=3)

    assert set(trackers) == {"b1", "b2"}
    assert all(isinstance(t, ZoneTracker) for t in trackers.values())
    assert trackers["b1"] is not trackers["b2"]
    assert trackers["b1"].polls == 2
    assert trackers["b1"].margin_db == 6.0
    assert trackers["b1"].absent_polls == 3


def _run_harness():
    building = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    config = Config([building])
    sessions = {"b1": {"ap-a": _FakeSession(result=[])}}
    trackers = {"b1": ZoneTracker(polls=1, margin_db=0, absent_polls=1)}
    return config, sessions, trackers


def test_run_stops_after_max_ticks_and_calls_on_tick_each_time():
    config, sessions, trackers = _run_harness()
    collected = []

    run(
        config,
        sessions,
        trackers,
        interval_s=5.0,
        on_tick=collected.append,
        max_ticks=3,
        now=lambda: 0.0,
        sleep=lambda _s: None,
    )

    assert len(collected) == 3


def test_run_schedules_against_a_fixed_anchor_so_tick_duration_does_not_drift():
    config, sessions, trackers = _run_harness()
    clock = {"t": 0.0}
    slept = []

    def on_tick(_results):
        clock["t"] += 2.0  # this tick "took" 2s of wall time

    def sleep(seconds):
        slept.append(seconds)
        clock["t"] += seconds

    run(
        config,
        sessions,
        trackers,
        interval_s=5.0,
        on_tick=on_tick,
        max_ticks=3,
        now=lambda: clock["t"],
        sleep=sleep,
    )

    # Anchored at 0, 5, 10, ...: each 2s of "processing" is compensated by sleeping only 3s,
    # not the full 5s -- a naive sleep(interval_s)-after-tick loop would drift to 0, 7, 14.
    assert slept == [3.0, 3.0]


def test_run_does_not_sleep_negative_when_a_tick_overruns_the_interval():
    config, sessions, trackers = _run_harness()
    clock = {"t": 0.0}
    slept = []

    def on_tick(_results):
        clock["t"] += 10.0  # longer than the 5s interval

    def sleep(seconds):
        slept.append(seconds)
        clock["t"] += seconds

    run(
        config,
        sessions,
        trackers,
        interval_s=5.0,
        on_tick=on_tick,
        max_ticks=2,
        now=lambda: clock["t"],
        sleep=sleep,
    )

    assert slept == [0.0]


def test_readings_for_building_counts_devices_per_zone():
    building = Building(
        name="b1",
        ap=[_ap(name="ap-a", zone="lobby"), _ap(name="ap-b", zone="hall")],
    )
    assignment = {"aa:bb:cc:00:00:01": "lobby", "aa:bb:cc:00:00:02": "lobby"}

    readings = readings_for_building(building, assignment, now_ms=1_000)

    assert sorted(readings, key=lambda r: r["roomId"]) == [
        {"type": "deviceDetection", "roomId": "hall", "timestamp": 1_000, "deviceCount": 0},
        {"type": "deviceDetection", "roomId": "lobby", "timestamp": 1_000, "deviceCount": 2},
    ]


def test_readings_for_building_reports_zero_not_absence_for_an_empty_zone():
    """A declared zone with nobody in it still gets a reading -- 0 is real data (the
    room is empty), not the same fact as the zone being missing entirely."""
    building = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])

    readings = readings_for_building(building, assignment={}, now_ms=1_000)

    assert readings == [
        {"type": "deviceDetection", "roomId": "lobby", "timestamp": 1_000, "deviceCount": 0}
    ]


def test_readings_for_building_ignores_devices_per_person_when_none():
    building = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    assignment = {"aa:bb:cc:00:00:01": "lobby", "aa:bb:cc:00:00:02": "lobby"}

    readings = readings_for_building(building, assignment, now_ms=1_000, devices_per_person=None)

    assert readings == [
        {"type": "deviceDetection", "roomId": "lobby", "timestamp": 1_000, "deviceCount": 2}
    ]


def test_readings_for_building_divides_by_devices_per_person_when_set():
    building = Building(name="b1", ap=[_ap(name="ap-a", zone="lobby")])
    assignment = {
        "aa:bb:cc:00:00:01": "lobby",
        "aa:bb:cc:00:00:02": "lobby",
        "aa:bb:cc:00:00:03": "lobby",
    }

    readings = readings_for_building(building, assignment, now_ms=1_000, devices_per_person=1.4)

    # 3 / 1.4 = 2.14... -> rounds to 2
    assert readings == [
        {"type": "deviceDetection", "roomId": "lobby", "timestamp": 1_000, "deviceCount": 2}
    ]
