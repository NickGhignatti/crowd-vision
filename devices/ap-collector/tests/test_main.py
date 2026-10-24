import email.message
import hashlib
import hmac
import json
import urllib.error
from pathlib import Path

from app.__main__ import _refreshing, main


class _FakeResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _fake_ubus_urlopen(request, timeout=None):
    body = json.loads(request.data)
    method = body["params"][2]
    if method == "login":
        payload = {"jsonrpc": "2.0", "id": 1, "result": [0, {"ubus_rpc_session": "tok"}]}
    else:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "result": [0, {"clients": {"aa:bb:cc:00:00:01": {"signal": -60}}}],
        }
    return _FakeResponse(json.dumps(payload).encode())


def _collector_answer(building_names):
    return {
        "buildings": [
            {
                "buildingId": name,
                "routers": [
                    {
                        "sensorId": "ap-a",
                        "roomId": "lobby",
                        "endpoint": f"http://{name}-ap-a.example/ubus",
                    }
                ],
            }
            for name in building_names
        ]
    }


def _make_fake_urlopen(posted, building_names=("b1",)):
    """Answers the router list, the ubus fake, and records every tick POST -- lets one test
    drive the whole pipeline (sync -> poll -> tick -> post) for real."""

    def fake(request, timeout=None):
        if request.get_method() == "GET":
            return _FakeResponse(json.dumps(_collector_answer(building_names)).encode())
        body = json.loads(request.data)
        if isinstance(body, dict) and body.get("method") == "call":
            return _fake_ubus_urlopen(request, timeout)
        posted.append(request)
        return _FakeResponse(b"")

    return fake


class _Subscription:
    def __init__(self, lines: list[bytes]):
        self._lines = lines

    def __iter__(self):
        return iter(self._lines)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _write_config(tmp_path, devices_per_person=None, subscribe_probes=False):
    data = {
        "pollIntervalS": 5,
        "requestTimeoutS": 3,
        "useDevicesPerPerson": devices_per_person is not None,
        "devicesPerPerson": devices_per_person,
        "subscribeProbes": subscribe_probes,
        "ubus": {"username": "collector", "password": "collector"},
    }
    path = tmp_path / "collector.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def _telemetry(monkeypatch):
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry.example/telemetry")
    monkeypatch.setenv("TELEMETRY_SERVICE_SECRET", "x" * 32)


def test_main_dry_run_once_prints_one_tick_summary(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("urllib.request.urlopen", _make_fake_urlopen([]))
    _telemetry(monkeypatch)
    config_path = _write_config(tmp_path)

    exit_code = main(["--config", config_path, "--once", "--dry-run"])

    assert exit_code == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["building"] == "b1"
    assert summary["answered"] == 1
    assert summary["connected"] == 1


def test_main_dry_run_with_probes_counts_bursts_and_never_prints_a_mac(
    tmp_path, monkeypatch, capsys
):
    probe = b'data: {"address":"02:aa:bb:cc:dd:ee","signal":-70}\n'
    base = _make_fake_urlopen([])

    def fake(request, timeout=None):
        if "/subscribe/" in request.full_url:
            return _Subscription([b"event: probe\n", probe, b"\n"])
        return base(request, timeout)

    monkeypatch.setattr("urllib.request.urlopen", fake)
    _telemetry(monkeypatch)
    config_path = _write_config(tmp_path, subscribe_probes=True)

    exit_code = main(["--config", config_path, "--once", "--dry-run"])

    out = capsys.readouterr().out
    assert exit_code == 0
    bursts = json.loads(out)["bursts"]
    assert set(bursts["perRouter"]) <= {"ap-a"}
    assert set(bursts["byRoutersHeard"]) <= {"1"}
    assert set(bursts) == {"perRouter", "byRoutersHeard", "fromConnected"}
    assert "02:aa:bb:cc:dd:ee" not in out


def test_main_without_dry_run_posts_a_signed_wifi_tick(tmp_path, monkeypatch):
    posted = []
    monkeypatch.setattr("urllib.request.urlopen", _make_fake_urlopen(posted))
    _telemetry(monkeypatch)
    config_path = _write_config(tmp_path)

    exit_code = main(["--config", config_path, "--once"])

    assert exit_code == 0
    (request,) = posted
    assert request.full_url == "http://telemetry.example/telemetry/observations"
    assert (
        request.get_header("X-signature")
        == hmac.new(b"x" * 32, request.data, hashlib.sha256).hexdigest()
    )
    body = json.loads(request.data)
    assert body["buildingId"] == "b1"
    assert isinstance(body["tick"], int)
    assert body["answered"] == ["ap-a"]
    (row,) = body["connected"]
    assert (row["router"], row["signal"]) == ("ap-a", -60)
    assert len(row["token"]) == 16
    assert body["bursts"] == []
    # No devicesPerPerson in this config, so telemetry makes no people estimate.
    assert "devicesPerPerson" not in body
    assert b"aa:bb:cc:00:00:01" not in request.data


def test_main_sends_the_sites_conversion_factor_with_the_tick(tmp_path, monkeypatch):
    posted = []
    monkeypatch.setattr("urllib.request.urlopen", _make_fake_urlopen(posted))
    _telemetry(monkeypatch)
    config_path = _write_config(tmp_path, devices_per_person=2.5)

    exit_code = main(["--config", config_path, "--once"])

    assert exit_code == 0
    assert json.loads(posted[0].data)["devicesPerPerson"] == 2.5


def test_main_survives_a_rejected_tick_and_still_posts_every_other_building(
    tmp_path, monkeypatch, capsys
):
    """Telemetry refusing one building's tick must not end the run. A tick is a snapshot:
    the next one supersedes it, so dropping one is recoverable and dying is not."""
    posted = []

    def fake(request, timeout=None):
        if request.get_method() == "GET":
            return _FakeResponse(json.dumps(_collector_answer(("b1", "b2"))).encode())
        body = json.loads(request.data)
        if isinstance(body, dict) and body.get("method") == "call":
            return _fake_ubus_urlopen(request, timeout)
        if body["buildingId"] == "b1":
            raise urllib.error.HTTPError(
                request.full_url, 400, "Bad Request", email.message.Message(), None
            )
        posted.append(body["buildingId"])
        return _FakeResponse(b"")

    monkeypatch.setattr("urllib.request.urlopen", fake)
    _telemetry(monkeypatch)
    config_path = _write_config(tmp_path)

    exit_code = main(["--config", config_path, "--once"])

    assert exit_code == 0
    assert posted == ["b2"]
    assert "b1" in capsys.readouterr().err


def test_main_with_a_building_key_reads_and_posts_for_that_building_only(tmp_path, monkeypatch):
    requests = []
    monkeypatch.setattr("urllib.request.urlopen", _make_fake_urlopen(requests, ("b1",)))
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry.example/telemetry")
    monkeypatch.delenv("TELEMETRY_SERVICE_SECRET", raising=False)
    config = json.loads(Path(_write_config(tmp_path)).read_text())
    config["keys"] = {"b1": "k" * 64}
    path = tmp_path / "keyed.json"
    path.write_text(json.dumps(config))

    exit_code = main(["--config", str(path), "--once"])

    assert exit_code == 0
    (tick,) = requests
    assert (
        tick.get_header("X-signature") == hmac.new(b"k" * 64, tick.data, hashlib.sha256).hexdigest()
    )


def test_main_reports_a_building_whose_routers_do_not_answer_as_unheard(tmp_path, monkeypatch):
    """An empty `answered` tells telemetry nothing was measured, so no room reads a fresh 0."""
    posted = []

    def fake(request, timeout=None):
        if request.get_method() == "GET":
            return _FakeResponse(json.dumps(_collector_answer(("b1",))).encode())
        if json.loads(request.data).get("method") == "call":
            raise urllib.error.HTTPError(
                request.full_url, 404, "Not Found", email.message.Message(), None
            )
        posted.append(json.loads(request.data))
        return _FakeResponse(b"")

    monkeypatch.setattr("urllib.request.urlopen", fake)
    _telemetry(monkeypatch)

    exit_code = main(["--config", _write_config(tmp_path), "--once"])

    assert exit_code == 0
    (tick,) = posted
    assert (tick["answered"], tick["connected"]) == ([], [])


def test_main_starts_with_no_building_when_telemetry_is_unreachable(tmp_path, monkeypatch, capsys):
    """A collector booting before the platform must keep running and pick routers up later."""

    def down(request, timeout=None):
        raise urllib.error.URLError("refused")

    monkeypatch.setattr("urllib.request.urlopen", down)
    _telemetry(monkeypatch)

    exit_code = main(["--config", _write_config(tmp_path), "--once"])

    assert exit_code == 0
    assert "refused" in capsys.readouterr().err


def test_the_router_list_is_refreshed_every_sync_interval():
    calls = []
    on_tick = _refreshing(
        lambda results: calls.append("tick"), lambda: calls.append("sync"), every=2
    )

    for _ in range(4):
        on_tick({})

    assert calls == ["tick", "tick", "sync", "tick", "tick", "sync"]


def test_main_replay_is_not_implemented_yet(tmp_path, capsys):
    exit_code = main(["--config", "unused.json", "--replay", "survey.csv"])

    assert exit_code == 2
    assert "isn't implemented yet" in capsys.readouterr().err
