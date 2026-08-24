"""Runs twin-service's building payload through the projections the twin tools hand
to the model. The fixture is the same file twin-service asserts against
(twin-service/tests/building_conformance.rs), so a renamed or dropped field fails on
both sides of the HTTP call instead of quietly becoming a `None` in a tool result.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.agent.tools.twin import _room_payload

_FIXTURE = Path(__file__).resolve().parents[3] / "contracts-fixtures" / "building.json"


def _building() -> dict:
    return json.loads(_FIXTURE.read_text())


def test_every_room_field_the_tools_project_is_present_in_the_payload() -> None:
    rooms = _building()["rooms"]
    assert rooms

    for room in rooms:
        projected = _room_payload(room)
        assert projected["id"]
        assert projected["name"]
        assert projected["capacity"] is not None
        assert set(projected["position"]) == {"x", "y", "z"}
        assert set(projected["dimensions"]) == {"width", "height", "depth"}


def test_the_building_carries_the_id_name_and_domains_the_tools_read() -> None:
    building = _building()

    assert building["id"]
    assert building["name"]
    assert isinstance(building["domains"], list)
    assert building["domains"]
