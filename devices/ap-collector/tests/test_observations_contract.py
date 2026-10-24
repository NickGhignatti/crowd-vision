"""The tick this collector POSTs is hand-built here and parsed by digital-twin in Rust.
`schemas/fixtures/wifi-observations.json` is the only thing holding the two to one shape.
"""

import json
from pathlib import Path

import pytest

from app.observations import MAX_BURSTS, MAX_CONNECTED, MAX_HEARD, observations_batch
from app.tokens import Scan, Sighting

_SCHEMAS = Path(__file__).resolve().parents[3] / "schemas"
_FIXTURE = json.loads((_SCHEMAS / "fixtures" / "wifi-observations.json").read_text())
_SCHEMA = json.loads((_SCHEMAS / "json" / "wifi-observations.schema.json").read_text())
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
        "devices_per_person": body.get("devicesPerPerson"),
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


def test_the_limits_are_the_contracts():
    properties = _SCHEMA["properties"]
    heard = _SCHEMA["$defs"]["burst"]["properties"]["heard"]

    assert properties["connected"]["maxItems"] == MAX_CONNECTED
    assert properties["bursts"]["maxItems"] == MAX_BURSTS
    assert heard["maxProperties"] == MAX_HEARD


# Telemetry refuses a tick over a limit whole, so a busy site would lose every tick.
def test_a_tick_over_the_row_limit_keeps_the_loudest_rows():
    rows = [Sighting(f"{n:016x}", "r1", -100 + n % 90) for n in range(MAX_CONNECTED + 10)]

    batch = observations_batch("b1", 1_000, ["r1"], rows, [])

    kept = batch["connected"]
    assert len(kept) == MAX_CONNECTED
    weakest_kept = min(row["signal"] for row in kept)
    dropped = sorted(row.signal for row in rows)[:10]
    assert max(dropped) <= weakest_kept


def test_a_burst_heard_by_more_routers_than_the_limit_keeps_the_loudest():
    heard = {f"r{n}": -50 - n for n in range(MAX_HEARD + 2)}

    batch = observations_batch("b1", 1_000, [], [], [Scan("a91e0c3d5f7b2846", 1.0, heard)])

    assert batch["bursts"][0]["heard"] == {f"r{n}": -50 - n for n in range(MAX_HEARD)}


def test_a_tick_over_the_burst_limit_keeps_the_newest_bursts():
    scans = [Scan(f"{n:016x}", float(n), {"r1": -60}) for n in range(MAX_BURSTS + 5)]

    batch = observations_batch("b1", 1_000, [], [], scans)

    starts = [burst["started"] for burst in batch["bursts"]]
    assert len(starts) == MAX_BURSTS
    assert min(starts) == 5_000
