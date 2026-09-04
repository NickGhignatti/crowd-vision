import email.message
import json
import urllib.error

from app.__main__ import main


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


def _make_fake_urlopen(ingest_calls):
    """Routes to the ubus fake for ubus JSON-RPC calls, records everything else as an
    ingest POST -- lets one test drive the whole pipeline (poll -> tick -> post) for real."""

    def fake(request, timeout=None):
        body = json.loads(request.data)
        if isinstance(body, dict) and body.get("method") == "call":
            return _fake_ubus_urlopen(request, timeout)
        ingest_calls.append(request)
        return _FakeResponse(b"")

    return fake


def _write_config(tmp_path, building_names=("b1",), devices_per_person=None):
    data = {
        "pollIntervalS": 5,
        "requestTimeoutS": 3,
        "useDevicesPerPerson": devices_per_person is not None,
        "devicesPerPerson": devices_per_person,
        "buildings": [
            {
                "name": name,
                "ap": [
                    {
                        "name": "ap-a",
                        "zone": "lobby",
                        "url": f"http://{name}-ap-a.example/ubus",
                        "username": "collector",
                        "password": "collector",
                        "ifaces": ["wlan0"],
                        "reader": "hostapd",
                    }
                ],
            }
            for name in building_names
        ],
    }
    path = tmp_path / "collector.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return str(path)


def test_main_dry_run_once_prints_one_tick_batch(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr("urllib.request.urlopen", _fake_ubus_urlopen)
    config_path = _write_config(tmp_path)

    exit_code = main(["--config", config_path, "--once", "--dry-run"])

    assert exit_code == 0
    batch = json.loads(capsys.readouterr().out)
    assert batch["building"] == "b1"
    assert batch["counts"] == {"totalDeviceCount": {"lobby": 1}}
    assert batch["transitions"] == {}


def test_main_without_dry_run_posts_a_signed_occupancy_batch(tmp_path, monkeypatch):
    ingest_calls = []
    monkeypatch.setattr("urllib.request.urlopen", _make_fake_urlopen(ingest_calls))
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry.example/telemetry")
    monkeypatch.setenv("TELEMETRY_SERVICE_SECRET", "x" * 32)
    config_path = _write_config(tmp_path)

    exit_code = main(["--config", config_path, "--once"])

    assert exit_code == 0
    assert len(ingest_calls) == 1
    request = ingest_calls[0]
    assert request.full_url == "http://telemetry.example/telemetry/ingest"
    assert request.get_header("X-signature")
    body = json.loads(request.data)
    assert body["buildingId"] == "b1"
    # No devicesPerPerson in this config, so the measurement ships and the estimate does not.
    assert len(body["readings"]) == 1
    reading = body["readings"][0]
    assert reading["type"] == "totalDeviceCount"
    assert reading["roomId"] == "lobby"
    assert reading["totalDeviceCount"] == 1
    assert isinstance(reading["timestamp"], int)


def test_main_posts_both_metrics_when_a_conversion_factor_is_configured(tmp_path, monkeypatch):
    ingest_calls = []
    monkeypatch.setattr("urllib.request.urlopen", _make_fake_urlopen(ingest_calls))
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry.example/telemetry")
    monkeypatch.setenv("TELEMETRY_SERVICE_SECRET", "x" * 32)
    config_path = _write_config(tmp_path, devices_per_person=2.5)

    exit_code = main(["--config", config_path, "--once"])

    assert exit_code == 0
    readings = json.loads(ingest_calls[0].data)["readings"]
    assert [(r["type"], r[r["type"]]) for r in readings] == [
        ("totalDeviceCount", 1),
        ("ratioDeviceCount", 1),
    ]


def test_main_survives_a_rejected_batch_and_still_posts_every_other_building(
    tmp_path, monkeypatch, capsys
):
    """Telemetry refusing one building's batch must not end the run. A tick is a snapshot:
    the next one supersedes it, so dropping one is recoverable and dying is not."""
    posted = []

    def fake(request, timeout=None):
        body = json.loads(request.data)
        if isinstance(body, dict) and body.get("method") == "call":
            return _fake_ubus_urlopen(request, timeout)
        if body["buildingId"] == "b1":
            raise urllib.error.HTTPError(
                request.full_url, 422, "Unprocessable", email.message.Message(), None
            )
        posted.append(body["buildingId"])
        return _FakeResponse(b"")

    monkeypatch.setattr("urllib.request.urlopen", fake)
    monkeypatch.setenv("TELEMETRY_SERVICE_URL", "http://telemetry.example/telemetry")
    monkeypatch.setenv("TELEMETRY_SERVICE_SECRET", "x" * 32)
    config_path = _write_config(tmp_path, ("b1", "b2"))

    exit_code = main(["--config", config_path, "--once"])

    assert exit_code == 0
    assert posted == ["b2"]
    assert "b1" in capsys.readouterr().err


def test_main_replay_is_not_implemented_yet(tmp_path, capsys):
    exit_code = main(["--config", "unused.json", "--replay", "survey.csv"])

    assert exit_code == 2
    assert "isn't implemented yet" in capsys.readouterr().err
