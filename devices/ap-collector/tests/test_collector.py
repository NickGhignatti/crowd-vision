import threading

import pytest

from app.collector import (
    build_readings,
    build_sessions,
    poll_aps,
    poll_one,
    run,
    sync_state,
    tick,
    tick_building,
)
from app.config import AccessPoint, Building, Config
from app.ubus import ApSession, Station, UbusError


class _FakeSession:
    def __init__(self, result: list[Station] | None = None, error: Exception | None = None) -> None:
        self._result = result
        self._error = error

    def stations(self) -> list[Station]:
        if self._error is not None:
            raise self._error
        assert self._result is not None
        return self._result


def test_poll_one_returns_stations_on_success():
    session = _FakeSession(result=[("aa:bb:cc:00:00:01", -60, 0)])

    result = poll_one("ap-a", session)

    assert result == ("ap-a", [("aa:bb:cc:00:00:01", -60, 0)])


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
    session_a = _FakeSession(result=[("aa:bb:cc:00:00:01", -60, 0)])
    session_b = _FakeSession(result=[("aa:bb:cc:00:00:02", -70, 0)])

    result = poll_aps({"ap-a": session_a, "ap-b": session_b})

    assert sorted(result) == [
        ("ap-a", [("aa:bb:cc:00:00:01", -60, 0)]),
        ("ap-b", [("aa:bb:cc:00:00:02", -70, 0)]),
    ]


def test_poll_aps_returns_none_for_a_failed_ap_without_affecting_others():
    session_a = _FakeSession(result=[("aa:bb:cc:00:00:01", -60, 0)])
    session_b = _FakeSession(error=UbusError("ap-b down"))

    result = poll_aps({"ap-a": session_a, "ap-b": session_b})

    assert sorted(result) == [
        ("ap-a", [("aa:bb:cc:00:00:01", -60, 0)]),
        ("ap-b", None),
    ]


def test_poll_aps_polls_every_ap_at_once():
    """Polled in sequence, N unreachable APs cost N * requestTimeoutS and push a tick past
    its interval. The barrier only releases if all four are in flight together, so a serial
    implementation deadlocks it and fails here rather than in a building at 3am."""
    barrier = threading.Barrier(4, timeout=5)

    class _BarrierSession:
        def stations(self) -> list[Station]:
            barrier.wait()
            return []

    result = poll_aps({f"ap-{i}": _BarrierSession() for i in range(4)})

    assert [name for name, _ in result] == ["ap-0", "ap-1", "ap-2", "ap-3"]


def test_poll_aps_returns_results_in_session_order():
    sessions = {
        "ap-c": _FakeSession(result=[("aa:bb:cc:00:00:03", -80, 0)]),
        "ap-a": _FakeSession(error=UbusError("down")),
        "ap-b": _FakeSession(result=[]),
    }

    assert [name for name, _ in poll_aps(sessions)] == ["ap-c", "ap-a", "ap-b"]


def test_poll_aps_with_no_sessions_returns_nothing():
    assert poll_aps({}) == []


def test_build_readings_flattens_stations_with_ap_name_attached():
    polled = [("ap-a", [("aa:bb:cc:00:00:01", -60, 0), ("aa:bb:cc:00:00:02", -70, 0)])]

    readings, answered = build_readings(polled)

    assert sorted(readings) == [
        ("ap-a", "aa:bb:cc:00:00:01", -60),
        ("ap-a", "aa:bb:cc:00:00:02", -70),
    ]
    assert answered == {"ap-a"}


def test_build_readings_drops_a_mac_left_behind_on_its_old_ap():
    polled = [
        ("ap-a", [("aa:bb:cc:00:00:01", -50, 90_000)]),
        ("ap-b", [("aa:bb:cc:00:00:01", -70, 800)]),
    ]

    readings, answered = build_readings(polled)

    assert readings == [("ap-b", "aa:bb:cc:00:00:01", -70)]
    assert answered == {"ap-a", "ap-b"}


def test_build_readings_keeps_every_row_of_a_mac_when_idle_ties():
    polled = [
        ("ap-a", [("aa:bb:cc:00:00:01", -50, 0)]),
        ("ap-b", [("aa:bb:cc:00:00:01", -70, 0)]),
    ]

    readings, _ = build_readings(polled)

    assert sorted(readings) == [
        ("ap-a", "aa:bb:cc:00:00:01", -50),
        ("ap-b", "aa:bb:cc:00:00:01", -70),
    ]


def test_build_readings_treats_idle_times_a_poll_jitter_apart_as_one_age():
    polled = [
        ("ap-a", [("aa:bb:cc:00:00:01", -50, 60_000)]),
        ("ap-b", [("aa:bb:cc:00:00:01", -70, 60_004)]),
    ]

    readings, _ = build_readings(polled)

    assert sorted(readings) == [
        ("ap-a", "aa:bb:cc:00:00:01", -50),
        ("ap-b", "aa:bb:cc:00:00:01", -70),
    ]


def test_build_readings_leaves_a_failed_ap_out_of_rows_and_answered():
    readings, answered = build_readings([("ap-a", None), ("ap-b", [])])

    assert readings == []
    assert answered == {"ap-b"}


def test_build_readings_counts_an_ap_that_heard_nobody_as_answered():
    """Telemetry reports a 0 for its room only when the router answered."""
    _, answered = build_readings([("ap-a", [])])

    assert answered == {"ap-a"}


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


def test_tick_building_polls_every_ap_and_names_those_that_answered():
    building = Building(name="b1", ap=[_ap(name="ap-a"), _ap(name="ap-b"), _ap(name="ap-c")])
    sessions = {
        "ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -60, 0)]),
        "ap-b": _FakeSession(result=[]),
        "ap-c": _FakeSession(error=UbusError("ap-c down")),
    }

    answered, rows = tick_building(building, sessions)

    assert rows == [("ap-a", "aa:bb:cc:00:00:01", -60)]
    assert answered == {"ap-a", "ap-b"}


def test_tick_building_hands_on_the_rows_left_after_dropping_roam_leftovers():
    building = Building(name="b1", ap=[_ap(name="ap-a"), _ap(name="ap-b")])
    sessions = {
        "ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -50, 240_000)]),
        "ap-b": _FakeSession(result=[("aa:bb:cc:00:00:01", -70, 0)]),
    }

    result = tick_building(building, sessions)

    assert result.rows == [("ap-b", "aa:bb:cc:00:00:01", -70)]


def test_tick_processes_every_building_independently():
    config = Config(
        [Building(name="b1", ap=[_ap(name="ap-a")]), Building(name="b2", ap=[_ap(name="ap-x")])]
    )
    sessions_by_building = {
        "b1": {"ap-a": _FakeSession(result=[("aa:bb:cc:00:00:01", -60, 0)])},
        "b2": {"ap-x": _FakeSession(result=[("aa:bb:cc:00:00:02", -70, 0)])},
    }

    results = tick(config, sessions_by_building)

    assert results["b1"] == ({"ap-a"}, [("ap-a", "aa:bb:cc:00:00:01", -60)])
    assert results["b2"] == ({"ap-x"}, [("ap-x", "aa:bb:cc:00:00:02", -70)])


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


def _run_harness():
    config = Config([Building(name="b1", ap=[_ap(name="ap-a")])])
    sessions = {"b1": {"ap-a": _FakeSession(result=[])}}
    return config, sessions


def test_run_stops_after_max_ticks_and_calls_on_tick_each_time():
    config, sessions = _run_harness()
    collected = []

    run(
        config,
        sessions,
        interval_s=5.0,
        on_tick=collected.append,
        max_ticks=3,
        now=lambda: 0.0,
        sleep=lambda _s: None,
    )

    assert len(collected) == 3


def test_run_schedules_against_a_fixed_anchor_so_tick_duration_does_not_drift():
    config, sessions = _run_harness()
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
    config, sessions = _run_harness()
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
        interval_s=5.0,
        on_tick=on_tick,
        max_ticks=2,
        now=lambda: clock["t"],
        sleep=sleep,
    )

    assert slept == [0.0]


def _router(name: str, zone: str, url: str | None = None) -> AccessPoint:
    return AccessPoint.from_json(
        {
            "name": name,
            "zone": zone,
            "url": url or f"http://{name}.example/ubus",
            "username": "collector",
            "password": "collector",
            "ifaces": ["wlan0"],
        }
    )


def test_a_new_router_list_keeps_what_stayed_and_adds_and_drops_the_rest():
    config = Config(
        [
            Building("b1", [_router("r1", "lobby"), _router("r2", "lab")]),
            Building("b2", [_router("r9", "hall")]),
        ]
    )
    sessions = build_sessions(config, timeout=3)
    kept_session = sessions["b1"]["r1"]

    config.buildings = [
        Building(
            "b1",
            [
                _router("r1", "lobby"),
                _router("r2", "lab", url="http://moved.example/ubus"),
                _router("r3", "hall"),
            ],
        ),
        Building("b3", [_router("r7", "atrium")]),
    ]
    sync_state(config, sessions, timeout=3)

    assert sessions["b1"]["r1"] is kept_session
    assert sessions["b1"]["r2"].ap.url == "http://moved.example/ubus"
    assert set(sessions["b1"]) == {"r1", "r2", "r3"}
    assert set(sessions) == {"b1", "b3"}
