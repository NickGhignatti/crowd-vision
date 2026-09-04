import json

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


def _write_config(tmp_path):
    data = [
        {
            "name": "b1",
            "ap": [
                {
                    "name": "ap-a",
                    "zone": "lobby",
                    "url": "http://ap-a.example/ubus",
                    "username": "collector",
                    "password": "collector",
                    "ifaces": ["wlan0"],
                    "reader": "hostapd",
                }
            ],
        }
    ]
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
    assert batch["counts"] == {"lobby": 1}
    assert batch["transitions"] == {}


def test_main_without_dry_run_posts_a_signed_peoplecount_batch(tmp_path, monkeypatch):
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
    assert len(body["readings"]) == 1
    reading = body["readings"][0]
    assert reading["type"] == "deviceDetection"
    assert reading["roomId"] == "lobby"
    assert reading["deviceCount"] == 1
    assert isinstance(reading["timestamp"], int)


def test_main_replay_is_not_implemented_yet(tmp_path, capsys):
    exit_code = main(["--config", "unused.json", "--replay", "survey.csv"])

    assert exit_code == 2
    assert "isn't implemented yet" in capsys.readouterr().err
