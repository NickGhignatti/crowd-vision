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


# The agent stream is a sequence, so its schema describes one frame and the fixture is
# walked frame by frame. Ordering is asserted by the consumers, not expressible here.
def _stream_validator() -> Draft202012Validator:
    schema = _load(Path("json") / "agent-stream.schema.json")
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _stream_fixture() -> dict:
    return _load(Path("fixtures") / "agent-stream.json")


def _terminal_frame_with(key: str) -> dict:
    """A terminal frame whose `key` is populated. No single case carries both citations
    and a tool call, so each mutation picks the frame that can actually hold it."""
    return next(
        case["frames"][-1] for case in _stream_fixture()["cases"] if case["frames"][-1].get(key)
    )


def test_every_frame_the_stream_fixture_pins_conforms_to_its_schema() -> None:
    validator = _stream_validator()

    for case in _stream_fixture()["cases"]:
        for frame in case["frames"]:
            errors = sorted(validator.iter_errors(frame), key=str)
            assert not errors, f"{case['name']}: " + "; ".join(e.message for e in errors)


def test_every_frame_the_stream_fixture_tolerates_also_validates() -> None:
    """Tolerated frames are minimal, not malformed: chat must survive them, and a
    conforming producer may still send them.
    """
    validator = _stream_validator()

    for case in _stream_fixture()["tolerated"]:
        errors = sorted(validator.iter_errors(case["frame"]), key=str)
        assert not errors, f"{case['name']}: " + "; ".join(e.message for e in errors)


def test_the_stream_schema_rejects_a_token_frame_with_no_text() -> None:
    frame = next(
        f for case in _stream_fixture()["cases"] for f in case["frames"] if f["type"] == "token"
    )
    del frame["text"]

    assert list(_stream_validator().iter_errors(frame))


@pytest.mark.parametrize(
    ("what", "holds", "mutate"),
    [
        ("no citations at all", "citations", lambda f: f.pop("citations")),
        (
            "a camelCased chunk id",
            "citations",
            lambda f: f["citations"][0].update(chunkId=f["citations"][0].pop("chunk_id")),
        ),
        (
            "a citation missing its heading key",
            "citations",
            lambda f: f["citations"][0].pop("section_path"),
        ),
        (
            "a renamed usage counter",
            "usage",
            lambda f: f["usage"].update(prompt_tokens=f["usage"].pop("input_tokens")),
        ),
        ("a decision the loop never emits", "usage", lambda f: f.update(decision="improvised")),
        (
            "a tool call with no error flag",
            "tool_calls",
            lambda f: f["tool_calls"][0].pop("is_error"),
        ),
        (
            "a tool call carrying an unknown key",
            "tool_calls",
            lambda f: f["tool_calls"][0].update(duration_ms=12),
        ),
    ],
)
def test_the_stream_schema_rejects_a_broken_terminal_frame(what: str, holds: str, mutate) -> None:
    """Each of these is a rename or omission chat would swallow: it defaults what it cannot
    read, so the answer still renders with its sources quietly gone.
    """
    frame = _terminal_frame_with(holds)
    mutate(frame)

    assert list(_stream_validator().iter_errors(frame)), what
