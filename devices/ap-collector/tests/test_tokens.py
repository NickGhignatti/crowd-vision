from itertools import count

from app.bursts import Burst
from app.tokens import Scan, Sighting, Tokens

PHONE = "aa:bb:cc:00:00:01"
RANDOM = "02:aa:bb:cc:dd:01"


def _numbered() -> Tokens:
    numbers = count(1)
    return Tokens(forget_after_ticks=3, mint=lambda: f"t{next(numbers)}")


def test_a_connected_phone_keeps_one_token_while_it_stays():
    tokens = _numbered()

    first, _ = tokens.observe([("ap-a", PHONE, -60)], [])
    second, _ = tokens.observe([("ap-b", PHONE, -66)], [])

    assert first == [Sighting("t1", "ap-a", -60)]
    assert second == [Sighting("t1", "ap-b", -66)]


def test_every_row_of_one_phone_carries_its_one_token():
    tokens = _numbered()

    sightings, _ = tokens.observe([("ap-a", PHONE, -60), ("ap-b", PHONE, -71)], [])

    assert {sighting.token for sighting in sightings} == {"t1"}


def test_a_phone_missing_for_fewer_ticks_than_the_limit_keeps_its_token():
    tokens = _numbered()
    tokens.observe([("ap-a", PHONE, -60)], [])
    tokens.observe([], [])
    tokens.observe([], [])

    sightings, _ = tokens.observe([("ap-a", PHONE, -60)], [])

    assert sightings == [Sighting("t1", "ap-a", -60)]


def test_a_phone_gone_for_the_limit_comes_back_as_a_stranger():
    tokens = _numbered()
    tokens.observe([("ap-a", PHONE, -60)], [])
    for _ in range(3):
        tokens.observe([], [])

    sightings, _ = tokens.observe([("ap-a", PHONE, -60)], [])

    assert sightings == [Sighting("t2", "ap-a", -60)]


def test_every_burst_from_an_unknown_address_gets_a_fresh_token():
    tokens = _numbered()
    scan = Burst(RANDOM, 100.0, {"ap-a": -70})

    _, scans = tokens.observe([], [scan, scan._replace(started=130.0)])

    assert scans == [Scan("t1", 100.0, {"ap-a": -70}), Scan("t2", 130.0, {"ap-a": -70})]


def test_a_burst_sent_from_a_connected_phones_own_address_carries_its_token():
    tokens = _numbered()

    _, scans = tokens.observe([("ap-a", PHONE, -60)], [Burst(PHONE, 100.0, {"ap-b": -72})])

    assert scans == [Scan("t1", 100.0, {"ap-b": -72})]


def test_a_token_is_random_not_derived_from_the_address():
    one, other = Tokens(), Tokens()

    (mine,), _ = one.observe([("ap-a", PHONE, -60)], [])
    (theirs,), _ = other.observe([("ap-a", PHONE, -60)], [])

    assert mine.token != theirs.token
    assert PHONE.replace(":", "") not in mine.token


def test_nothing_observed_carries_an_address():
    sightings, scans = Tokens().observe(
        [("ap-a", PHONE, -60)], [Burst(RANDOM, 100.0, {"ap-a": -70})]
    )

    assert PHONE not in repr(sightings)
    assert RANDOM not in repr(scans)
