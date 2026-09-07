import json

import pytest

from app.config import AccessPoint
from app.ubus import (
    NULL_SESSION,
    ApSession,
    UbusError,
    UbusState,
    UbusStatusError,
    login,
    stations_hostapd,
    stations_iwinfo,
)

URL = "http://ap-a.example/ubus"


class _FakeResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _ok(payload=None):
    result = [0] if payload is None else [0, payload]
    return json.dumps({"jsonrpc": "2.0", "id": 1, "result": result}).encode()


def _status(code):
    return json.dumps({"jsonrpc": "2.0", "id": 1, "result": [code]}).encode()


def _mock_urlopen(monkeypatch, body: bytes | None = None, raise_error: Exception | None = None):
    captured = {}

    def fake(request, timeout=None):
        captured["request"] = request
        captured["timeout"] = timeout
        if raise_error is not None:
            raise raise_error
        return _FakeResponse(body or b"")

    monkeypatch.setattr("urllib.request.urlopen", fake)
    return captured


def _mock_sequence(monkeypatch, *responses):
    """Each item is either response bytes or an Exception, consumed in call order."""
    calls = []

    def fake(request, timeout=None):
        calls.append(request)
        item = responses[len(calls) - 1]
        if isinstance(item, Exception):
            raise item
        return _FakeResponse(item)

    monkeypatch.setattr("urllib.request.urlopen", fake)
    return calls


def _method_of(request) -> str:
    return json.loads(request.data)["params"][2]


def _ap(**overrides) -> AccessPoint:
    fields = {
        "name": "ap-a",
        "zone": "zone-a",
        "url": URL,
        "username": "collector",
        "password": "collector",
        "ifaces": ["wlan0"],
        "reader": "hostapd",
    }
    fields.update(overrides)
    return AccessPoint(**fields)


def test_login_returns_token_on_success(monkeypatch):
    _mock_urlopen(monkeypatch, body=_ok({"ubus_rpc_session": "tok123"}))

    token = login(URL, "collector", "collector", timeout=3)

    assert token == "tok123"


def test_login_sends_null_session_and_correct_params(monkeypatch):
    captured = _mock_urlopen(monkeypatch, body=_ok({"ubus_rpc_session": "tok123"}))

    login(URL, "alice", "s3cret", timeout=3)

    request = captured["request"]
    assert request.get_method() == "POST"
    assert request.full_url == URL
    assert captured["timeout"] == 3
    body = json.loads(request.data)
    assert body["method"] == "call"
    assert body["params"] == [
        NULL_SESSION,
        "session",
        "login",
        {"username": "alice", "password": "s3cret"},
    ]


def test_login_wrong_password_raises_permission_denied(monkeypatch):
    _mock_urlopen(monkeypatch, body=_status(UbusState.UBUS_STATUS_PERMISSION_DENIED.value))

    with pytest.raises(UbusStatusError) as exc_info:
        login(URL, "collector", "wrong", timeout=3)

    assert exc_info.value.status == UbusState.UBUS_STATUS_PERMISSION_DENIED


def test_login_missing_token_raises(monkeypatch):
    _mock_urlopen(monkeypatch, body=_ok({}))

    with pytest.raises(UbusError):
        login(URL, "collector", "collector", timeout=3)


def test_login_unknown_status_code_raises_ubus_error_not_status_error(monkeypatch):
    _mock_urlopen(monkeypatch, body=_status(99))

    with pytest.raises(UbusError) as exc_info:
        login(URL, "collector", "collector", timeout=3)

    assert not isinstance(exc_info.value, UbusStatusError)


def test_login_top_level_json_rpc_error_raises(monkeypatch):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "error": {"code": -32000, "message": "boom"}}
    ).encode()
    _mock_urlopen(monkeypatch, body=body)

    with pytest.raises(UbusError):
        login(URL, "collector", "collector", timeout=3)


def test_login_malformed_json_raises(monkeypatch):
    _mock_urlopen(monkeypatch, body=b"not json")

    with pytest.raises(UbusError):
        login(URL, "collector", "collector", timeout=3)


def test_login_response_with_no_result_or_error_raises(monkeypatch):
    body = json.dumps({"jsonrpc": "2.0", "id": 1}).encode()
    _mock_urlopen(monkeypatch, body=body)

    with pytest.raises(UbusError):
        login(URL, "collector", "collector", timeout=3)


def test_login_unreachable_ap_raises(monkeypatch):
    import urllib.error

    _mock_urlopen(monkeypatch, raise_error=urllib.error.URLError("connection refused"))

    with pytest.raises(UbusError):
        login(URL, "collector", "collector", timeout=3)


def test_login_timeout_raises(monkeypatch):
    _mock_urlopen(monkeypatch, raise_error=TimeoutError())

    with pytest.raises(UbusError):
        login(URL, "collector", "collector", timeout=3)


def test_stations_hostapd_parses_clients_map(monkeypatch):
    _mock_urlopen(monkeypatch, body=_ok({"clients": {"AA:BB:CC:00:00:01": {"signal": -55}}}))

    result = stations_hostapd(URL, "tok", "wlan0", timeout=3)

    assert result == [("aa:bb:cc:00:00:01", -55)]


def test_stations_hostapd_addresses_correct_object_and_method(monkeypatch):
    captured = _mock_urlopen(monkeypatch, body=_ok({"clients": {}}))

    stations_hostapd(URL, "tok", "wlan0", timeout=3)

    body = json.loads(captured["request"].data)
    assert body["params"] == ["tok", "hostapd.wlan0", "get_clients", {}]


def test_stations_hostapd_skips_malformed_entries(monkeypatch):
    _mock_urlopen(
        monkeypatch,
        body=_ok(
            {
                "clients": {
                    "aa:bb:cc:00:00:01": {"signal": -55},
                    "aa:bb:cc:00:00:02": {"nosignal": True},
                    "aa:bb:cc:00:00:03": "not-a-dict",
                }
            }
        ),
    )

    result = stations_hostapd(URL, "tok", "wlan0", timeout=3)

    assert result == [("aa:bb:cc:00:00:01", -55)]


def test_stations_hostapd_missing_clients_key_raises(monkeypatch):
    _mock_urlopen(monkeypatch, body=_ok({}))

    with pytest.raises(UbusError):
        stations_hostapd(URL, "tok", "wlan0", timeout=3)


def test_stations_iwinfo_parses_results_list(monkeypatch):
    _mock_urlopen(monkeypatch, body=_ok({"results": [{"mac": "AA:BB:CC:00:00:01", "signal": -40}]}))

    result = stations_iwinfo(URL, "tok", "wlan0", timeout=3)

    assert result == [("aa:bb:cc:00:00:01", -40)]


def test_stations_iwinfo_addresses_correct_object_and_method(monkeypatch):
    captured = _mock_urlopen(monkeypatch, body=_ok({"results": []}))

    stations_iwinfo(URL, "tok", "wlan0", timeout=3)

    body = json.loads(captured["request"].data)
    assert body["params"] == ["tok", "iwinfo", "assoclist", {"device": "wlan0"}]


def test_stations_iwinfo_skips_malformed_entries(monkeypatch):
    _mock_urlopen(
        monkeypatch,
        body=_ok(
            {
                "results": [
                    {"mac": "aa:bb:cc:00:00:01", "signal": -40},
                    {"mac": "aa:bb:cc:00:00:02"},
                    {"signal": -50},
                    "not-a-dict",
                ]
            }
        ),
    )

    result = stations_iwinfo(URL, "tok", "wlan0", timeout=3)

    assert result == [("aa:bb:cc:00:00:01", -40)]


def test_stations_iwinfo_missing_results_key_raises(monkeypatch):
    _mock_urlopen(monkeypatch, body=_ok({}))

    with pytest.raises(UbusError):
        stations_iwinfo(URL, "tok", "wlan0", timeout=3)


def test_session_logs_in_once_and_reuses_cached_token(monkeypatch):
    hostapd_body = _ok({"clients": {"aa:bb:cc:00:00:01": {"signal": -60}}})
    calls = _mock_sequence(
        monkeypatch,
        _ok({"ubus_rpc_session": "tok1"}),
        hostapd_body,
        hostapd_body,
    )
    session = ApSession(_ap(), timeout=3)

    first = session.stations()
    second = session.stations()

    assert first == [("aa:bb:cc:00:00:01", -60)]
    assert second == first
    assert sum(1 for c in calls if _method_of(c) == "login") == 1


def test_session_retries_once_on_expired_session(monkeypatch):
    hostapd_body = _ok({"clients": {"aa:bb:cc:00:00:01": {"signal": -60}}})
    calls = _mock_sequence(
        monkeypatch,
        _ok({"ubus_rpc_session": "tok1"}),
        _status(UbusState.UBUS_STATUS_PERMISSION_DENIED.value),
        _ok({"ubus_rpc_session": "tok2"}),
        hostapd_body,
    )
    session = ApSession(_ap(), timeout=3)

    result = session.stations()

    assert result == [("aa:bb:cc:00:00:01", -60)]
    assert sum(1 for c in calls if _method_of(c) == "login") == 2


def test_session_raises_after_second_consecutive_permission_denied(monkeypatch):
    calls = _mock_sequence(
        monkeypatch,
        _ok({"ubus_rpc_session": "tok1"}),
        _status(UbusState.UBUS_STATUS_PERMISSION_DENIED.value),
        _ok({"ubus_rpc_session": "tok2"}),
        _status(UbusState.UBUS_STATUS_PERMISSION_DENIED.value),
    )
    session = ApSession(_ap(), timeout=3)

    with pytest.raises(UbusStatusError):
        session.stations()

    assert len(calls) == 4


def test_session_does_not_retry_on_transport_failure(monkeypatch):
    import urllib.error

    calls = _mock_sequence(
        monkeypatch,
        _ok({"ubus_rpc_session": "tok1"}),
        urllib.error.URLError("connection refused"),
    )
    session = ApSession(_ap(), timeout=3)

    with pytest.raises(UbusError):
        session.stations()

    assert len(calls) == 2


def test_session_aggregates_across_multiple_ifaces(monkeypatch):
    body_a = _ok({"clients": {"aa:bb:cc:00:00:01": {"signal": -60}}})
    body_b = _ok({"clients": {"aa:bb:cc:00:00:02": {"signal": -70}}})
    _mock_sequence(monkeypatch, _ok({"ubus_rpc_session": "tok1"}), body_a, body_b)
    session = ApSession(_ap(ifaces=["wlan0", "wlan1"]), timeout=3)

    result = session.stations()

    assert sorted(result) == [("aa:bb:cc:00:00:01", -60), ("aa:bb:cc:00:00:02", -70)]


def test_session_uses_iwinfo_reader_when_configured(monkeypatch):
    calls = _mock_sequence(
        monkeypatch,
        _ok({"ubus_rpc_session": "tok1"}),
        _ok({"results": [{"mac": "aa:bb:cc:00:00:01", "signal": -40}]}),
    )
    session = ApSession(_ap(reader="iwinfo"), timeout=3)

    result = session.stations()

    assert result == [("aa:bb:cc:00:00:01", -40)]
    read_call = next(c for c in calls if _method_of(c) != "login")
    assert json.loads(read_call.data)["params"][1] == "iwinfo"
