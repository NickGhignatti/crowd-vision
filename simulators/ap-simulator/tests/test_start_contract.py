"""Telemetry builds the start body in Rust and this simulator parses it with Pydantic.
`schemas/fixtures/simulation-start.json` is the only thing holding the two to one shape.
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from schemas import BuildingStart

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "simulation-start.json"
    ).read_text()
)


@pytest.mark.parametrize("case", _FIXTURE["cases"], ids=lambda c: c["name"])
def test_every_start_the_fixture_accepts_validates(case):
    start = BuildingStart.model_validate(case["body"])
    assert start.model_dump(exclude_none=True) == case["body"]


@pytest.mark.parametrize("case", _FIXTURE["rejected"], ids=lambda c: c["name"])
def test_every_start_the_fixture_rejects_is_refused(case):
    with pytest.raises(ValidationError):
        BuildingStart.model_validate(case["body"])
