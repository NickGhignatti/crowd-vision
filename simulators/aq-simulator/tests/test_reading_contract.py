"""The batch this simulator POSTs is hand-built here and hand-parsed by
telemetry. `schemas/fixtures/ingest-batch.json` is the only thing holding the two
to one shape, so a rename here has to fail here rather than stopping readings silently.
"""

import json
from pathlib import Path

from scenarios import Scenario
from simulator import SimulationRoom

_FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "ingest-batch.json").read_text()
)


def _pinned_reading() -> dict:
    case = next(c for c in _FIXTURE["cases"] if c["producer"] == "aq-simulator")
    return case["body"]["readings"][0]


def _read_one() -> dict:
    room = SimulationRoom(
        building_id="bldg-3f2b4c5d",
        room_id="room-lab-2",
        scenario=Scenario.OCCUPIED_OFFICE,
    )
    return room.read(0.1).model_dump()


def test_the_reading_carries_exactly_the_fields_the_fixture_pins():
    assert sorted(_read_one()) == sorted(_pinned_reading())


def test_the_reading_does_not_repeat_the_batchs_building():
    """`buildingId` belongs to the batch. Telemetry stamps it onto every reading and
    rejects one naming a different building, so sending it here can only agree or break.
    """
    assert "buildingId" not in _read_one()


def test_the_type_selects_the_plugin_the_fixture_names():
    assert _read_one()["type"] == _pinned_reading()["type"] == "airQuality"


def test_the_scenario_is_one_the_simulator_can_actually_produce():
    """The fixture's scenario is a plain string to telemetry, which validates it only as a
    non-empty string -- so nothing downstream would catch an invented value.
    """
    assert _pinned_reading()["scenario"] in {s.value for s in Scenario}
