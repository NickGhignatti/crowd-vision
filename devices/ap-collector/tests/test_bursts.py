from app.bursts import Burst, Bursts, group_bursts
from app.probes import Probe

PHONE = "02:aa:bb:cc:dd:01"
OTHER = "02:aa:bb:cc:dd:02"


def test_one_scan_heard_by_three_routers_is_one_burst_with_its_loudest_frame_per_router():
    probes = [
        Probe("ap-a", PHONE, -70, 100.0),
        Probe("ap-a", PHONE, -64, 100.2),
        Probe("ap-b", PHONE, -75, 100.4),
        Probe("ap-c", PHONE, -81, 101.1),
    ]

    closed, still_open = group_bursts(probes, now=110.0)

    assert closed == [Burst(PHONE, 100.0, {"ap-a": -64, "ap-b": -75, "ap-c": -81})]
    assert still_open == []


def test_an_address_heard_again_after_the_window_is_a_second_scan():
    probes = [Probe("ap-a", PHONE, -60, 100.0), Probe("ap-a", PHONE, -62, 130.0)]

    closed, _ = group_bursts(probes, now=140.0)

    assert closed == [Burst(PHONE, 100.0, {"ap-a": -60}), Burst(PHONE, 130.0, {"ap-a": -62})]


def test_the_window_is_anchored_at_a_bursts_first_frame_so_a_steady_stream_still_splits():
    probes = [Probe("ap-a", PHONE, -60, 100.0 + second) for second in range(6)]

    closed, _ = group_bursts(probes, now=120.0, window_s=2.0)

    assert [burst.started for burst in closed] == [100.0, 103.0]


def test_two_phones_scanning_at_the_same_moment_are_two_bursts():
    probes = [Probe("ap-a", PHONE, -60, 100.0), Probe("ap-a", OTHER, -70, 100.1)]

    closed, _ = group_bursts(probes, now=110.0)

    assert {burst.address for burst in closed} == {PHONE, OTHER}


def test_frames_arriving_out_of_order_from_several_listener_threads_group_the_same():
    probes = [Probe("ap-b", PHONE, -75, 100.4), Probe("ap-a", PHONE, -64, 100.0)]

    closed, _ = group_bursts(probes, now=110.0)

    assert closed == [Burst(PHONE, 100.0, {"ap-a": -64, "ap-b": -75})]


def test_a_burst_still_inside_its_window_is_handed_back_unclosed():
    late = Probe("ap-a", OTHER, -70, 109.5)
    probes = [Probe("ap-a", PHONE, -60, 100.0), late]

    closed, still_open = group_bursts(probes, now=110.0, window_s=2.0)

    assert [burst.address for burst in closed] == [PHONE]
    assert still_open == [late]


def test_an_open_burst_is_carried_to_the_next_tick_and_joined_by_its_late_frames():
    queued = {
        "b1": [[Probe("ap-a", PHONE, -60, 109.5)], [Probe("ap-b", PHONE, -72, 110.3)]],
    }
    clock = iter([110.0, 115.0])
    bursts = Bursts(lambda building: queued[building].pop(0), clock=lambda: next(clock))

    assert bursts.take("b1") == []
    assert bursts.take("b1") == [Burst(PHONE, 109.5, {"ap-a": -60, "ap-b": -72})]


def test_an_open_burst_is_carried_only_for_its_own_building():
    queued = {"b1": [Probe("ap-a", PHONE, -60, 109.5)], "b2": []}
    bursts = Bursts(lambda building: queued[building], clock=lambda: 110.0)

    bursts.take("b1")

    assert bursts.take("b2") == []
