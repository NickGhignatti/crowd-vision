import json
import urllib.error
from pathlib import Path

import pytest

from app.config import RouterLogin, Site
from app.routers import SyncError, buildings_from, fetch_routers, parse_answer, sign_request

_FIXTURES = Path(__file__).resolve().parents[3] / "schemas" / "fixtures"
REQUEST = json.loads((_FIXTURES / "collector-request.json").read_text())
ROUTERS = json.loads((_FIXTURES / "collector-routers.json").read_text())
SITE = Site(RouterLogin("collector", "secret", ("wlan0",)))


def _answer(name: str) -> dict:
    return next(c for c in ROUTERS["cases"] if c["name"] == name)["body"]


def test_requests_sign_as_the_fixture_pins():
    secret = REQUEST["secret"].encode()
    for case in REQUEST["cases"]:
        building = case["buildingId"] or None
        signature = sign_request(secret, building, case["timestamp"])
        assert signature == case["signature"], case["name"]


@pytest.mark.parametrize("case", ROUTERS["cases"], ids=lambda c: c["name"])
def test_every_answer_the_fixture_accepts_parses(case):
    parse_answer(case["body"])


@pytest.mark.parametrize("case", ROUTERS["rejected"], ids=lambda c: c["name"])
def test_every_answer_the_fixture_rejects_is_refused(case):
    with pytest.raises(ValueError):
        parse_answer(case["body"])


def test_each_router_becomes_an_ap_in_its_room_read_as_its_driver_says():
    (aula, iwinfo) = buildings_from(
        _answer("two buildings, one router without driver or endpoint"), SITE
    )
    ap = aula.ap[0]
    assert (aula.name, ap.name, ap.zone, ap.url, ap.reader) == (
        "bldg-3f2b4c5d",
        "e6f70819-2a3b-4c4d-8e5f-60718293a4b5",
        "room-aula-magna",
        "http://10.0.4.12/ubus",
        "hostapd",
    )
    assert (ap.username, ap.password, ap.ifaces) == ("collector", "secret", ("wlan0",))
    assert iwinfo.ap[0].reader == "iwinfo"


def test_a_router_without_an_endpoint_is_skipped_unless_the_site_has_a_template():
    answer = _answer("two buildings, one router without driver or endpoint")
    assert [len(b.ap) for b in buildings_from(answer, SITE)] == [1, 1]

    templated = Site(SITE.login, endpoint_template="http://ap-simulator:3000/{sensorId}/ubus")
    aula = buildings_from(answer, templated)[0]
    assert aula.ap[1].url == "http://ap-simulator:3000/f7081920-3b4c-4d5e-9f60-718293a4b5c6/ubus"


def test_a_per_router_override_replaces_the_site_login():
    site = Site(SITE.login, overrides={"e6f70819-2a3b-4c4d-8e5f-60718293a4b5": {"password": "x"}})
    aula = buildings_from(_answer("two buildings, one router without driver or endpoint"), site)[0]
    assert aula.ap[0].password == "x"


def test_a_building_left_with_no_reachable_router_is_dropped():
    answer = {"buildings": [{"buildingId": "b1", "routers": [{"sensorId": "r", "roomId": "a"}]}]}
    assert buildings_from(answer, SITE) == []


class _Response:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_fetch_signs_a_timestamped_get_and_parses_the_answer(monkeypatch):
    seen = []

    def fake(request, timeout=None):
        seen.append((request, timeout))
        return _Response(json.dumps(_answer("no building has a router")).encode())

    monkeypatch.setattr("urllib.request.urlopen", fake)
    answer = fetch_routers(
        "http://t.example/telemetry", b"k" * 32, timeout=3, building_id="b 1", now=lambda: 1000.9
    )

    (request, timeout) = seen[0]
    assert answer == {"buildings": []}
    assert (request.get_method(), request.full_url, timeout) == (
        "GET",
        "http://t.example/telemetry/collector?buildingId=b+1",
        3,
    )
    assert request.get_header("X-timestamp") == "1000"
    assert request.get_header("X-signature") == sign_request(b"k" * 32, "b 1", "1000")


def test_fetch_reports_an_unreachable_or_refusing_telemetry_as_a_sync_error(monkeypatch):
    def refuse(request, timeout=None):
        raise urllib.error.URLError("refused")

    monkeypatch.setattr("urllib.request.urlopen", refuse)
    with pytest.raises(SyncError):
        fetch_routers("http://t.example/telemetry", b"k" * 32, timeout=3)
