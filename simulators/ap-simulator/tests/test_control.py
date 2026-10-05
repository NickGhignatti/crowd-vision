import asyncio
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import api
from building import BuildingWorld
from config import SimConfig
from geometry import Layout, Point, Room
from twin import TwinError

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "simulation-start.json"
    ).read_text()
)
ROUTERS = next(c for c in _FIXTURE["cases"] if c["consumer"] == "ap-simulator")["body"]
BUILDING = ROUTERS["buildingId"]
ROUTER = ROUTERS["sensors"][0]["sensorId"]
ROOMS = [
    Room("room-lab-2", Point(5.0, 1.5, 5.0), 10.0, 3.0, 10.0),
    Room("room-aula-magna", Point(15.0, 1.5, 5.0), 10.0, 3.0, 10.0),
]
NOON = time.mktime((2026, 9, 23, 12, 0, 0, 0, 0, -1))


@pytest.fixture
def client(monkeypatch) -> TestClient:
    return _client(monkeypatch, (ROOMS, None))


def _client(monkeypatch, geometry) -> TestClient:
    api.buildings.clear()

    def fetch(_url: str, _building_id: str):
        if isinstance(geometry, Exception):
            raise geometry
        return geometry

    monkeypatch.setattr(api, "fetch_geometry", fetch)
    return TestClient(api.app)


def _running(client: TestClient) -> bool:
    return client.get("/control/status", params={"buildingId": BUILDING}).json()["isRunning"]


def _call(client: TestClient, ap_id: str, params: list) -> tuple[int, dict]:
    body = {"jsonrpc": "2.0", "id": 1, "method": "call", "params": params}
    response = client.post(f"/{ap_id}/ubus", json=body)
    return response.status_code, response.json()


_LOGIN = ["0" * 32, "session", "login", {"username": "collector", "password": "collector"}]


def _login(client: TestClient, ap_id: str) -> int:
    return _call(client, ap_id, _LOGIN)[0]


def _token(client: TestClient, ap_id: str) -> str:
    return _call(client, ap_id, _LOGIN)[1]["result"][1]["ubus_rpc_session"]


def _lively_world() -> BuildingWorld:
    layout = Layout.of(ROOMS, [(s["sensorId"], s["roomId"]) for s in ROUTERS["sensors"]], None)
    config = SimConfig(
        scan_slot_s=1.0,
        scan_interval_on_s=1.0,
        screen_on_dwelling=1.0,
        screen_on_walking=1.0,
        passersby_per_hour=0,
    )
    return BuildingWorld(BUILDING, layout, config)


def test_start_runs_the_building_and_serves_one_ap_per_router(client):
    assert client.post("/control/start", json=ROUTERS).status_code == 200
    assert _running(client)
    assert _login(client, ROUTER) == 200


def test_an_empty_start_stops_the_building(client):
    client.post("/control/start", json=ROUTERS)
    client.post("/control/start", json={"buildingId": BUILDING, "sensors": []})
    assert not _running(client)
    assert _login(client, ROUTER) == 404


def test_a_router_removed_before_a_restart_stops_answering(client):
    client.post("/control/start", json=ROUTERS)
    client.post("/control/start", json={**ROUTERS, "sensors": ROUTERS["sensors"][1:]})
    assert _login(client, ROUTER) == 404


def test_stop_ends_the_building_and_an_unknown_one_is_already_stopped(client):
    client.post("/control/start", json=ROUTERS)
    assert client.post("/control/stop", json={"buildingId": BUILDING}).status_code == 200
    assert client.post("/control/stop", json={"buildingId": "ghost"}).status_code == 200
    assert not _running(client)


def test_the_old_body_that_chose_its_own_ingest_target_is_refused(client):
    body = {**ROUTERS, "targetUrl": "http://localhost/telemetry/"}
    assert client.post("/control/start", json=body).status_code == 422


def test_a_start_twin_cannot_describe_fails_and_runs_nothing(monkeypatch):
    client = _client(monkeypatch, TwinError("digital-twin unreachable"))
    assert client.post("/control/start", json=ROUTERS).status_code == 502
    assert not _running(client)


def test_a_router_in_a_room_twin_does_not_know_is_not_simulated(monkeypatch):
    client = _client(monkeypatch, (ROOMS[:1], None))
    client.post("/control/start", json=ROUTERS)
    assert _login(client, ROUTER) == 200
    assert _login(client, ROUTERS["sensors"][1]["sensorId"]) == 404


def test_every_router_answers_both_hostapd_and_iwinfo(client):
    client.post("/control/start", json=ROUTERS)
    token = _token(client, ROUTER)
    _, hostapd = _call(client, ROUTER, [token, "hostapd.wlan0", "get_clients", {}])
    _, iwinfo = _call(client, ROUTER, [token, "iwinfo", "assoclist", {"device": "wlan0"}])
    assert set(hostapd["result"][1]) == {"freq", "clients"}
    assert isinstance(iwinfo["result"][1]["results"], list)


def test_a_killed_router_is_unreachable_until_revived(client):
    client.post("/control/start", json=ROUTERS)
    client.post(f"/debug/kill/{ROUTER}")
    assert _login(client, ROUTER) == 503
    client.post(f"/debug/revive/{ROUTER}")
    assert _login(client, ROUTER) == 200


def test_subscribing_needs_a_live_session_and_an_object_the_router_has(client):
    client.post("/control/start", json=ROUTERS)
    path = f"/{ROUTER}/ubus/subscribe/hostapd.wlan0"
    assert client.get(path).status_code == 403
    assert client.get(path, headers={"Authorization": "Bearer nope"}).status_code == 403
    bearer = {"Authorization": f"Bearer {_token(client, ROUTER)}"}
    assert client.get(f"/{ROUTER}/ubus/subscribe/hostapd.wlan9", headers=bearer).status_code == 404


def test_ground_truth_is_served_per_building(client):
    client.post("/control/start", json=ROUTERS)
    truth = client.get("/debug/ground-truth", params={"buildingId": BUILDING}).json()
    assert {"phones", "bursts"} <= set(truth)
    assert client.get("/debug/ground-truth", params={"buildingId": "ghost"}).status_code == 404


def test_the_probe_stream_writes_hostapds_events_as_server_sent_events():
    world = _lively_world()
    clock = [NOON]

    async def sleep(_seconds: float) -> None:
        clock[0] += 2.0

    async def take(n: int) -> list[str]:
        stream = api.probe_stream(world, ROUTER, now=lambda: clock[0], sleep=sleep)
        return [await anext(stream) for _ in range(n)]

    chunks = asyncio.run(take(20))
    assert all(chunk.endswith("\n\n") for chunk in chunks)
    probes = [chunk for chunk in chunks if chunk.startswith("event: probe\n")]
    assert probes
    data = json.loads(probes[0].split("data: ", 1)[1])
    assert set(data) == {"address", "ifname", "target", "signal", "freq"}


def test_the_probe_stream_ends_when_its_router_goes_down():
    world = _lively_world()
    world.kill(ROUTER)

    async def no_sleep(_seconds: float) -> None:
        return None

    async def drain() -> list[str]:
        stream = api.probe_stream(world, ROUTER, now=lambda: NOON, sleep=no_sleep)
        return [chunk async for chunk in stream]

    assert asyncio.run(drain()) == []
