"""Telemetry builds the start body in Rust and this simulator parses it with Pydantic.
`schemas/fixtures/simulation-start.json` is the only thing holding the two to one shape.
"""

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api import app
from schemas import BuildingConfig
from simulator import SimulationBuilding, Simulator

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "simulation-start.json"
    ).read_text()
)


def _body(consumer: str) -> dict:
    return next(c for c in _FIXTURE["cases"] if c["consumer"] == consumer)["body"]


@pytest.mark.parametrize("case", _FIXTURE["cases"], ids=lambda c: c["name"])
def test_every_start_the_fixture_accepts_validates(case):
    config = BuildingConfig.model_validate(case["body"])
    assert config.buildingId == case["body"]["buildingId"]
    assert [s.model_dump() for s in config.sensors] == case["body"]["sensors"]


@pytest.mark.parametrize("case", _FIXTURE["rejected"], ids=lambda c: c["name"])
def test_every_start_the_fixture_rejects_is_refused(case):
    with pytest.raises(ValidationError):
        BuildingConfig.model_validate(case["body"])


def test_each_air_quality_station_gets_its_own_room_state():
    body = _body("aq-simulator")
    building = SimulationBuilding(config=BuildingConfig.model_validate(body))
    assert {sensor_id: room.room_id for sensor_id, room in building.rooms.items()} == {
        s["sensorId"]: s["roomId"] for s in body["sensors"]
    }


def test_a_kind_it_does_not_simulate_gets_no_state():
    body = {
        "buildingId": "bldg-3f2b4c5d",
        "sensors": [
            {"sensorId": "t1", "sensorType": "temperature", "roomId": "room-lab-2"},
            {"sensorId": "rt1", "sensorType": "router", "roomId": "room-lab-2"},
        ],
    }
    assert SimulationBuilding(config=BuildingConfig.model_validate(body)).rooms == {}


def test_an_empty_start_stops_a_running_building():
    sim = Simulator()
    building_id = _body("aq-simulator")["buildingId"]

    async def scenario():
        sim.start_or_add(BuildingConfig.model_validate(_body("aq-simulator")))
        assert sim.get_is_running(building_id)
        sim.start_or_add(BuildingConfig.model_validate(_body("any")))
        return sim.get_is_running(building_id), sim.active_building_ids

    running, active = asyncio.run(scenario())
    assert not running
    assert active == []


def test_stopping_a_building_it_never_simulated_is_not_an_error():
    Simulator().stop("ghost")


def test_the_old_body_that_chose_its_own_ingest_target_is_refused():
    response = TestClient(app).post(
        "/control/start",
        json={
            "buildingId": "bldg-3f2b4c5d",
            "roomIds": ["room-lab-2"],
            "targetUrl": "http://localhost/telemetry/",
        },
    )
    assert response.status_code == 422


def test_stopping_an_unknown_building_over_http_succeeds():
    response = TestClient(app).post("/control/stop", json={"buildingId": "ghost"})
    assert response.status_code == 200
