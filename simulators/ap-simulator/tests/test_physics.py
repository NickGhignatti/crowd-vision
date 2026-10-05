import statistics

from physics import free_space_rssi, gaussian, uniform


def test_signal_falls_ten_db_per_decade_per_unit_of_exponent():
    assert free_space_rssi(1.0, -40.0, 2.2) == -40.0
    assert free_space_rssi(10.0, -40.0, 2.0) == -60.0


def test_signal_at_the_router_itself_is_clamped_to_one_metre():
    assert free_space_rssi(0.0, -40.0, 2.2) == -40.0


def test_noise_is_fixed_by_its_key_so_every_reader_of_one_tick_agrees():
    assert gaussian(4.0, "phone", "r1", 7) == gaussian(4.0, "phone", "r1", 7)
    assert gaussian(4.0, "phone", "r1", 7) != gaussian(4.0, "phone", "r1", 8)


def test_noise_has_the_spread_it_was_asked_for():
    draws = [gaussian(4.0, "phone", "r1", k) for k in range(4000)]
    assert abs(statistics.fmean(draws)) < 0.3
    assert 3.7 < statistics.pstdev(draws) < 4.3


def test_uniform_stays_in_the_unit_interval():
    assert all(0.0 <= uniform("k", i) < 1.0 for i in range(2000))
