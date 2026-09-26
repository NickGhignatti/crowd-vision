import json
from pathlib import Path

from fastapi.testclient import TestClient

import api

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "simulation-start.json"
    ).read_text()
)
PLACED = next(c for c in _FIXTURE["cases"] if "two placed routers" in c["name"])["body"]
BUILDING = PLACED["buildingId"]
ROUTER = PLACED["sensors"][0]["sensorId"]


def _client() -> TestClient:
    api.buildings.clear()
    return TestClient(api.app)


def _running(client: TestClient) -> bool:
    return client.get("/control/status", params={"buildingId": BUILDING}).json()["isRunning"]


def _login(client: TestClient, ap_id: str) -> int:
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "call",
        "params": [
            "0" * 32,
            "session",
            "login",
            {"username": "collector", "password": "collector"},
        ],
    }
    return client.post(f"/{ap_id}/ubus", json=body).status_code


def test_start_runs_the_building_and_serves_one_ap_per_router():
    client = _client()
    assert client.post("/control/start", json=PLACED).status_code == 200
    assert _running(client)
    assert _login(client, ROUTER) == 200


def test_an_empty_start_stops_the_building():
    client = _client()
    client.post("/control/start", json=PLACED)
    client.post("/control/start", json={"buildingId": BUILDING, "sensors": []})
    assert not _running(client)
    assert _login(client, ROUTER) == 404


def test_a_router_removed_before_a_restart_stops_answering():
    client = _client()
    client.post("/control/start", json=PLACED)
    client.post("/control/start", json={**PLACED, "sensors": PLACED["sensors"][1:]})
    assert _login(client, ROUTER) == 404


def test_stop_ends_the_building_and_an_unknown_one_is_already_stopped():
    client = _client()
    client.post("/control/start", json=PLACED)
    assert client.post("/control/stop", json={"buildingId": BUILDING}).status_code == 200
    assert client.post("/control/stop", json={"buildingId": "ghost"}).status_code == 200
    assert not _running(client)


def test_the_old_body_that_chose_its_own_ingest_target_is_refused():
    body = {**PLACED, "targetUrl": "http://localhost/telemetry/"}
    assert _client().post("/control/start", json=body).status_code == 422


def test_the_preset_topology_is_still_served_and_inspected_under_debug():
    client = _client()
    assert _login(client, "ap-a") == 200
    assert "ap-a" in client.get("/debug/status").json()["aps"]
