"""
AL-8: a staff member connects or removes sensors, in a room or outside every room.

Runs against the deployed telemetry image, so the migration that made sensor ids
server-generated and room_id nullable is exercised on a real boot, not only in
telemetry's own throwaway-database tests.
"""

import httpx
import pytest

from support import telemetry
from support.claims import claims_header
from support.config import TELEMETRY_URL

STAFF = {"x-gateway-claims": claims_header(role="business_staff")}
OUTSIDER = {"x-gateway-claims": claims_header(domain="other-domain")}


@pytest.fixture()
def building() -> str:
    building_id, _ = telemetry.new_room()
    with httpx.Client(timeout=10.0) as client:
        client.put(
            f"{TELEMETRY_URL}/thresholds/buildings/{building_id}",
            headers=STAFF,
            json={"name": "Acceptance HQ", "rooms": [{"id": "r1", "name": "Lab"}]},
        ).raise_for_status()
    return building_id


def _sensors(client: httpx.Client, building_id: str) -> dict[str, dict]:
    response = client.get(f"{TELEMETRY_URL}/sensors/buildings/{building_id}", headers=STAFF)
    response.raise_for_status()
    return {s["sensorId"]: s for s in response.json()["data"]}


def test_a_sensor_batch_creates_moves_and_removes_sensors(building: str) -> None:
    url = f"{TELEMETRY_URL}/sensors/buildings/{building}"
    with httpx.Client(timeout=10.0) as client:
        created = client.post(
            url,
            headers=STAFF,
            json={"create": [
                {"ref": "d1", "name": "Lab thermostat", "sensorType": "temperature", "roomId": "r1"},
                {"ref": "d2", "name": "Router yard", "sensorType": "peopleCount", "roomId": None},
            ]},
        )
        created.raise_for_status()
        ids = {c["ref"]: c["sensorId"] for c in created.json()["created"]}

        listed = _sensors(client, building)
        assert listed[ids["d2"]]["roomId"] is None
        assert listed[ids["d1"]]["name"] == "Lab thermostat"

        client.post(
            url,
            headers=STAFF,
            json={"update": [{"sensorId": ids["d2"], "name": "Router lab", "roomId": "r1"}],
                  "delete": [ids["d1"]]},
        ).raise_for_status()

        listed = _sensors(client, building)
        assert list(listed) == [ids["d2"]]
        assert listed[ids["d2"]]["roomId"] == "r1"
        assert listed[ids["d2"]]["name"] == "Router lab"


def test_a_sensor_batch_from_another_domain_is_forbidden(building: str) -> None:
    with httpx.Client(timeout=10.0) as client:
        response = client.post(
            f"{TELEMETRY_URL}/sensors/buildings/{building}",
            headers=OUTSIDER,
            json={"create": [{"ref": "d1", "name": "Intruder", "sensorType": "temperature"}]},
        )
        assert response.status_code == 403
        assert _sensors(client, building) == {}
