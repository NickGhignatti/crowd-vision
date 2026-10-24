"""The tick this collector POSTs is hand-built here and parsed by digital-twin in Rust.
`schemas/fixtures/wifi-observations.json` is the only thing holding the two to one shape.
"""

import json
from pathlib import Path

import pytest

from app.observations import observations_batch
from app.tokens import Scan, Sighting

_FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "wifi-observations.json"
    ).read_text()
)
_CASES = [case for case in _FIXTURE["cases"] if case["producer"] == "ap-collector"]


def _inputs(body: dict) -> dict:
    """The collector's own values behind a fixture body: burst starts are seconds here."""
    return {
        "building_id": body["buildingId"],
        "tick_ms": body["tick"],
        "answered": body["answered"],
        "sightings": [
            Sighting(row["token"], row["router"], row["signal"]) for row in body["connected"]
        ],
        "scans": [
            Scan(burst["token"], burst["started"] / 1000, burst["heard"])
            for burst in body["bursts"]
        ],
    }


@pytest.mark.parametrize("case", _CASES, ids=[case["name"] for case in _CASES])
def test_the_batch_is_exactly_the_fixture_body(case):
    assert observations_batch(**_inputs(case["body"])) == case["body"]


def test_a_burst_start_becomes_whole_milliseconds():
    batch = observations_batch(
        "b1", 1_000, [], [], [Scan("a91e0c3d5f7b2846", 1761299998.412, {"r": -58})]
    )

    assert batch["bursts"][0]["started"] == 1761299998412


def test_a_router_that_answered_is_listed_once():
    batch = observations_batch("b1", 1_000, ["r-1", "r-1", "r-2"], [], [])

    assert batch["answered"] == ["r-1", "r-2"]
