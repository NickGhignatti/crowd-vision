from collections import Counter

import pytest

from app.zones import ZoneTracker, best_by_zone

AP_ZONES = {"ap-lobby": "lobby", "ap-floor2": "floor-2", "ap-canteen": "canteen"}


def test_best_by_zone_unions_one_device_across_three_zones():
    readings = [
        ("ap-lobby", "aa:bb", -70),
        ("ap-floor2", "aa:bb", -48),
        ("ap-canteen", "aa:bb", -81),
    ]

    assert best_by_zone(readings, AP_ZONES) == {
        "aa:bb": {"lobby": -70, "floor-2": -48, "canteen": -81}
    }


def test_best_by_zone_keeps_the_strongest_reading_per_zone_when_two_aps_share_it():
    ap_zones = {"ap-lobby-a": "lobby", "ap-lobby-b": "lobby", "ap-hall": "hall"}
    readings = [
        ("ap-lobby-a", "aa:bb", -75),
        ("ap-lobby-b", "aa:bb", -60),
        ("ap-hall", "aa:bb", -90),
    ]

    assert best_by_zone(readings, ap_zones) == {"aa:bb": {"lobby": -60, "hall": -90}}


def test_best_by_zone_drops_readings_from_an_unmapped_ap():
    readings = [("ap-guest-unmapped", "aa:bb", -40), ("ap-lobby", "aa:bb", -70)]

    assert best_by_zone(readings, AP_ZONES) == {"aa:bb": {"lobby": -70}}


def test_zone_tracker_first_sighting_is_not_a_transition():
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1)

    assignment, moves = tracker.update({"aa:bb": {"lobby": -60}}, {"lobby", "hall"})

    assert assignment == {"aa:bb": "lobby"}
    assert moves == Counter()


def test_zone_tracker_confirms_move_only_after_polls_consecutive_wins():
    tracker = ZoneTracker(polls=2, margin_db=5, absent_polls=1)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby", "hall"})

    first, first_moves = tracker.update({"aa:bb": {"lobby": -60, "hall": -50}}, {"lobby", "hall"})
    assert first == {"aa:bb": "lobby"}
    assert first_moves == Counter()

    second, second_moves = tracker.update({"aa:bb": {"lobby": -60, "hall": -50}}, {"lobby", "hall"})
    assert second == {"aa:bb": "hall"}
    assert second_moves == Counter({("lobby", "hall"): 1})


def test_zone_tracker_challenger_below_margin_never_starts_a_streak():
    tracker = ZoneTracker(polls=1, margin_db=10, absent_polls=1)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby", "hall"})

    for _ in range(5):
        assignment, moves = tracker.update(
            {"aa:bb": {"lobby": -60, "hall": -55}}, {"lobby", "hall"}
        )
        assert assignment == {"aa:bb": "lobby"}
        assert moves == Counter()


def test_zone_tracker_broken_streak_resets_the_candidate_counter():
    tracker = ZoneTracker(polls=2, margin_db=5, absent_polls=1)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby", "hall"})

    tracker.update({"aa:bb": {"lobby": -60, "hall": -50}}, {"lobby", "hall"})  # 1st winning poll
    tracker.update({"aa:bb": {"lobby": -60, "hall": -58}}, {"lobby", "hall"})  # streak broken

    assignment, moves = tracker.update({"aa:bb": {"lobby": -60, "hall": -50}}, {"lobby", "hall"})

    assert assignment == {"aa:bb": "lobby"}
    assert moves == Counter()


def test_zone_tracker_freezes_when_incumbent_zone_is_unavailable():
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby", "hall"})

    # lobby's AP went silent this tick -- a neighbour hearing the device faintly must not
    # be treated as a move, and the device must not expire either.
    assignment, moves = tracker.update({"aa:bb": {"hall": -80}}, {"hall"})

    assert assignment == {"aa:bb": "lobby"}
    assert moves == Counter()


def test_zone_tracker_does_not_accrue_a_miss_while_its_own_zone_is_unavailable():
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})

    # lobby's AP is down and nobody heard this device at all -- absence proves nothing
    # here either, so a single tick of this must not expire it even with absent_polls=1.
    assignment, _ = tracker.update({}, set())

    assert assignment == {"aa:bb": "lobby"}


def test_zone_tracker_expires_after_absent_polls_consecutive_misses():
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=2)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})

    # lobby's AP is up (available), but this device just isn't in the readings anymore.
    assignment, _ = tracker.update({}, {"lobby"})
    assert assignment == {"aa:bb": "lobby"}

    assignment, _ = tracker.update({}, {"lobby"})
    assert assignment == {}


def test_zone_tracker_reappearance_resets_missed_polls():
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=2)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})
    tracker.update({}, {"lobby"})  # one miss

    assignment, _ = tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})
    assert assignment == {"aa:bb": "lobby"}

    # If the miss counter had not reset, this second miss would hit absent_polls=2.
    assignment, _ = tracker.update({}, {"lobby"})
    assert assignment == {"aa:bb": "lobby"}


def test_zone_tracker_drops_a_device_frozen_past_frozen_polls():
    """Freezing survives an AP reboot. An AP that never comes back would otherwise hold the
    device -- and its count -- forever, growing the track table for the life of the process."""
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1, frozen_polls=2)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})

    assignment, _ = tracker.update({}, set())
    assert assignment == {"aa:bb": "lobby"}

    assignment, _ = tracker.update({}, set())
    assert assignment == {}


def test_zone_tracker_reappearance_resets_frozen_polls():
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=1, frozen_polls=2)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})
    tracker.update({}, set())  # one frozen poll

    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})

    # If the frozen counter had not reset, this would hit frozen_polls=2 and drop it.
    assignment, _ = tracker.update({}, set())
    assert assignment == {"aa:bb": "lobby"}


def test_zone_tracker_keeps_frozen_and_absent_counters_apart():
    """A poll spent frozen is not a poll of proven absence: becoming available again must
    not inherit the frozen count and expire the device early."""
    tracker = ZoneTracker(polls=1, margin_db=0, absent_polls=2, frozen_polls=5)
    tracker.update({"aa:bb": {"lobby": -60}}, {"lobby"})
    tracker.update({}, set())
    tracker.update({}, set())

    assignment, _ = tracker.update({}, {"lobby"})
    assert assignment == {"aa:bb": "lobby"}


@pytest.mark.parametrize(
    "kwargs",
    [
        {"polls": 0, "margin_db": 5, "absent_polls": 1},
        {"polls": 1, "margin_db": -1, "absent_polls": 1},
        {"polls": 1, "margin_db": 5, "absent_polls": 0},
        {"polls": 1, "margin_db": 5, "absent_polls": 1, "frozen_polls": 0},
        {"polls": 1, "margin_db": 5, "absent_polls": 3, "frozen_polls": 2},
    ],
)
def test_zone_tracker_rejects_invalid_construction_parameters(kwargs):
    with pytest.raises(ValueError):
        ZoneTracker(**kwargs)
