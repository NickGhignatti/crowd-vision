import json
import time
import urllib.error
from email.message import Message

import pytest

from app.config import AccessPoint, Building
from app.probes import Probe, ProbeBuffer, ProbeHub, ProbeListener, parse_events, probe_from
from app.ubus import UbusError

URL = "http://ap-a.example/ubus"
MAC = "02:aa:bb:cc:dd:ee"
PROBE_DATA = (
    'data: {"address":"02:AA:BB:CC:DD:EE","ifname":"wlan0",'
    '"target":"ff:ff:ff:ff:ff:ff","signal":-71,"freq":5180}\n'
)
ONE_PROBE = ["event: probe\n", PROBE_DATA, "\n"]


def _ap(name: str = "ap-a", url: str = URL) -> AccessPoint:
    return AccessPoint(
        name=name,
        zone="lobby",
        url=url,
        username="collector",
        password="collector",
        ifaces=("wlan0",),
    )


class _Login:
    def __init__(self, token: str) -> None:
        result = {"jsonrpc": "2.0", "id": 1, "result": [0, {"ubus_rpc_session": token}]}
        self._body = json.dumps(result).encode()

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _Stream:
    def __init__(self, lines: list[str], then: Exception | None = None) -> None:
        self._lines = lines
        self._then = then

    def __iter__(self):
        for line in self._lines:
            yield line.encode()
        if self._then is not None:
            raise self._then

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class _Router:
    """A fake uhttpd: fresh token per login, subscriptions answered from a script."""

    def __init__(self, *streams) -> None:
        self._streams = list(streams)
        self.logins = 0
        self.subscriptions: list = []

    def __call__(self, request, timeout=None):
        if request.get_method() == "POST":
            self.logins += 1
            return _Login(f"tok-{self.logins}")
        self.subscriptions.append((request, timeout))
        item = self._streams.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def _refused() -> urllib.error.HTTPError:
    return urllib.error.HTTPError(URL, 403, "Forbidden", Message(), None)


def test_an_event_ends_at_a_blank_line_and_a_half_received_one_is_held_back():
    lines = [
        "event: probe\n",
        'data: {"a":1}\n',
        "\n",
        "data: x\n",
        "data: y\n",
        "\n",
        "event: probe\n",
    ]
    assert list(parse_events(lines)) == [("probe", '{"a":1}'), ("message", "x\ny")]


def test_only_a_probe_with_an_address_and_a_signal_becomes_a_reading():
    data = '{"address":"02:AA:BB:CC:DD:EE","signal":-71,"freq":5180}'
    assert probe_from("ap-a", "probe", data, 10.0) == Probe("ap-a", MAC, -71, 10.0)
    assert probe_from("ap-a", "assoc", data, 10.0) is None
    assert probe_from("ap-a", "probe", '{"address":"02:aa:bb:cc:dd:ee"}', 10.0) is None
    assert probe_from("ap-a", "probe", "not json", 10.0) is None


def test_the_buffer_hands_each_probe_to_exactly_one_drain():
    buffer = ProbeBuffer()
    first, second = Probe("ap-a", MAC, -70, 1.0), Probe("ap-b", MAC, -80, 1.2)
    buffer.add(first)
    buffer.add(second)
    assert buffer.drain() == [first, second]
    assert buffer.drain() == []


def test_a_full_buffer_drops_its_oldest_probe():
    buffer = ProbeBuffer(limit=2)
    probes = [Probe("ap-a", MAC, -70, float(t)) for t in range(3)]
    for probe in probes:
        buffer.add(probe)
    assert buffer.drain() == probes[1:]


def test_a_subscription_streams_the_routers_probes_into_the_buffer(monkeypatch):
    router = _Router(_Stream([*ONE_PROBE, "event: assoc\n", PROBE_DATA, "\n"]))
    monkeypatch.setattr("urllib.request.urlopen", router)
    buffer = ProbeBuffer()

    ProbeListener(_ap(), buffer, clock=lambda: 42.0).listen_once("wlan0")

    assert buffer.drain() == [Probe("ap-a", MAC, -71, 42.0)]
    request, timeout = router.subscriptions[0]
    assert request.full_url == f"{URL}/subscribe/hostapd.wlan0"
    assert request.get_header("Authorization") == "Bearer tok-1"
    assert timeout is not None and timeout > 0


def test_a_quiet_stream_is_an_ordinary_end_not_a_failure(monkeypatch):
    router = _Router(_Stream(ONE_PROBE, then=TimeoutError("timed out")))
    monkeypatch.setattr("urllib.request.urlopen", router)
    buffer = ProbeBuffer()

    ProbeListener(_ap(), buffer).listen_once("wlan0")

    assert len(buffer.drain()) == 1


def test_a_session_is_kept_across_reconnects(monkeypatch):
    router = _Router(_Stream([]), _Stream([]))
    monkeypatch.setattr("urllib.request.urlopen", router)
    listener = ProbeListener(_ap(), ProbeBuffer())
    listener.listen_once("wlan0")
    listener.listen_once("wlan0")
    assert router.logins == 1


def test_a_refused_session_logs_in_afresh_on_the_next_attempt(monkeypatch):
    router = _Router(_refused(), _Stream([]))
    monkeypatch.setattr("urllib.request.urlopen", router)
    listener = ProbeListener(_ap(), ProbeBuffer())

    with pytest.raises(UbusError):
        listener.listen_once("wlan0")
    listener.listen_once("wlan0")

    assert router.logins == 2
    assert router.subscriptions[1][0].get_header("Authorization") == "Bearer tok-2"


def test_an_unreachable_router_is_a_ubus_error(monkeypatch):
    router = _Router(urllib.error.URLError("connection refused"))
    monkeypatch.setattr("urllib.request.urlopen", router)
    with pytest.raises(UbusError):
        ProbeListener(_ap(), ProbeBuffer()).listen_once("wlan0")


def test_the_listener_reconnects_on_its_own_thread_until_stopped(monkeypatch):
    router = _Router(*[_Stream(ONE_PROBE) for _ in range(1000)])
    monkeypatch.setattr("urllib.request.urlopen", router)
    buffer = ProbeBuffer()
    listener = ProbeListener(_ap(), buffer, backoff_s=0.001)

    listener.start()
    deadline = time.monotonic() + 2.0
    while len(router.subscriptions) < 3 and time.monotonic() < deadline:
        time.sleep(0.01)
    listener.stop()
    while listener.running and time.monotonic() < deadline:
        time.sleep(0.01)

    assert len(router.subscriptions) >= 3
    assert len(buffer.drain()) >= 3
    assert not listener.running


class _FakeListener:
    def __init__(self, ap: AccessPoint, buffer: ProbeBuffer) -> None:
        self.ap = ap
        self.buffer = buffer
        self.running = False

    def start(self) -> None:
        self.running = True

    def stop(self) -> None:
        self.running = False


def test_the_hub_follows_the_router_list_and_restarts_only_a_router_that_changed():
    made: list[_FakeListener] = []

    def make(ap: AccessPoint, buffer: ProbeBuffer) -> _FakeListener:
        made.append(_FakeListener(ap, buffer))
        return made[-1]

    hub = ProbeHub(make)
    hub.sync([Building("b1", [_ap("a"), _ap("b")])])
    hub.sync([Building("b1", [_ap("a"), _ap("b", url="http://moved.example/ubus"), _ap("c")])])

    running = {listener.ap.name: listener for listener in made if listener.running}
    assert set(running) == {"a", "b", "c"}
    assert running["b"].ap.url == "http://moved.example/ubus"
    assert [listener.ap.name for listener in made] == ["a", "b", "b", "c"]

    hub.sync([Building("b1", [_ap("c")])])
    assert [listener.ap.name for listener in made if listener.running] == ["c"]
    hub.stop()
    assert not any(listener.running for listener in made)


def test_each_building_drains_only_what_its_own_routers_heard():
    made: dict[str, _FakeListener] = {}

    def make(ap: AccessPoint, buffer: ProbeBuffer) -> _FakeListener:
        made[ap.name] = _FakeListener(ap, buffer)
        return made[ap.name]

    hub = ProbeHub(make)
    hub.sync([Building("b1", [_ap("a")]), Building("b2", [_ap("z")])])
    made["a"].buffer.add(Probe("a", MAC, -70, 1.0))

    assert hub.drain("b2") == []
    assert hub.drain("b1") == [Probe("a", MAC, -70, 1.0)]
    assert hub.drain("unknown") == []
