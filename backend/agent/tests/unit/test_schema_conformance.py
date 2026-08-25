"""Validates the shared fixtures against the shared JSON Schemas.

Rust and Go assert these fixtures by parsing them into a type, which enforces the
shape as a side effect. Python has no such type — `app/auth.py` reads a plain dict —
so this is the check that the fixture, and therefore the contract Python reads, is
still what `schemas/json/` says it is.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

_SCHEMAS = Path(__file__).resolve().parents[4] / "schemas"

CASES = [
    ("standard-claims.schema.json", "standard-claims.json"),
    ("building.schema.json", "building.json"),
]


def _load(relative: Path) -> dict:
    return json.loads((_SCHEMAS / relative).read_text())


@pytest.mark.parametrize(("schema_name", "fixture_name"), CASES)
def test_the_fixture_conforms_to_its_schema(schema_name: str, fixture_name: str) -> None:
    schema = _load(Path("json") / schema_name)
    fixture = _load(Path("fixtures") / fixture_name)

    Draft202012Validator.check_schema(schema)
    errors = sorted(Draft202012Validator(schema).iter_errors(fixture), key=str)

    assert not errors, "\n".join(f"{list(e.path)}: {e.message}" for e in errors)


def test_the_claims_schema_rejects_a_payload_missing_its_subject() -> None:
    schema = _load(Path("json") / "standard-claims.schema.json")
    fixture = _load(Path("fixtures") / "standard-claims.json")
    del fixture["sub"]

    assert list(Draft202012Validator(schema).iter_errors(fixture))


def test_the_building_schema_rejects_a_room_without_geometry() -> None:
    schema = _load(Path("json") / "building.schema.json")
    fixture = _load(Path("fixtures") / "building.json")
    del fixture["rooms"][0]["position"]

    assert list(Draft202012Validator(schema).iter_errors(fixture))
