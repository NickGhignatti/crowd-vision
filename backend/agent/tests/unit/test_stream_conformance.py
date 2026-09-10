"""The SSE frames chat parses, asserted against `schemas/fixtures/agent-stream.json`.

`stream_answer` builds the terminal frame from dataclass `__dict__` dumps, so renaming an
attribute on `Citation` or `Usage` renames a wire key with no serializer in between. Chat
reads those keys by hand in Rust and defaults what it cannot find: a rename leaves it
falling back to the accumulated tokens the loop had already rejected, with nothing failing.
"""

import json
from pathlib import Path
from typing import TYPE_CHECKING, cast

import pytest

from app.agent.llm.base import ChatTurn, CompletionUsage, TextDelta, ToolCall
from app.agent.loop import Agent, Usage
from app.agent.prompts import IDK_MARKER
from app.auth import AuthUser
from app.citations import Citation
from app.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

# No tool in these scripts touches the database, so the loop never dereferences it.
NO_SESSION = cast("AsyncSession", None)

_FIXTURE = json.loads(
    (Path(__file__).resolve().parents[4] / "schemas" / "fixtures" / "agent-stream.json").read_text()
)


def _pinned(frame_type: str) -> dict:
    for case in _FIXTURE["cases"]:
        for frame in case["frames"]:
            if frame["type"] == frame_type:
                return frame
    raise AssertionError(f"the fixture pins no {frame_type} frame")


def _terminals() -> list[dict]:
    return [case["frames"][-1] for case in _FIXTURE["cases"]]


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _turn(text="", tool_calls=None):
    return ChatTurn(
        text=text,
        tool_calls=tool_calls or [],
        usage=CompletionUsage(0, 0, 0.0),
        model="fake-model",
    )


class _ScriptedLLM:
    """Each hop is a (deltas, ChatTurn) pair, replayed on the streaming path."""

    model = "fake-model"

    def __init__(self, hops):
        self._hops = list(hops)

    async def complete(self, messages, temperature=None):  # pragma: no cover - unused
        raise AssertionError("the loop must not call complete()")

    async def chat(self, messages, tools=None, temperature=None):  # pragma: no cover - unused
        raise AssertionError("these tests exercise the streaming path")

    async def stream_chat(self, messages, tools=None, temperature=None):
        deltas, finished = self._hops.pop(0)
        for delta in deltas:
            yield TextDelta(delta)
        yield finished


async def _frames(hops) -> list[dict]:
    return [
        event
        async for event in Agent(llm=_ScriptedLLM(hops)).stream_answer(
            NO_SESSION, "which room is full?", AuthUser("user-1")
        )
    ]


@pytest.mark.asyncio
async def test_a_token_frame_carries_the_keys_the_fixture_pins():
    frames = await _frames([(["Room ", "B2 is full."], _turn("Room B2 is full."))])

    token = next(f for f in frames if f["type"] == "token")
    assert sorted(token) == sorted(_pinned("token"))


@pytest.mark.asyncio
async def test_the_terminal_frame_carries_the_keys_the_fixture_pins():
    frames = await _frames([(["Room B2 is full."], _turn("Room B2 is full."))])

    done = next(f for f in frames if f["type"] == "done")
    assert sorted(done) == sorted(_pinned("done"))


@pytest.mark.asyncio
async def test_exactly_one_terminal_frame_arrives_and_it_arrives_last():
    """Chat reads the absence of a `done` event as an invalid response."""
    frames = await _frames([(["a", "b"], _turn("ab"))])

    assert [f["type"] for f in frames] == ["token", "token", "done"]


@pytest.mark.asyncio
async def test_a_tool_hop_still_ends_in_one_terminal_frame_of_the_pinned_shape():
    frames = await _frames(
        [
            ([], _turn(tool_calls=[ToolCall(id="1", name="unknown_tool", arguments={})])),
            (["The ", "answer."], _turn("The answer.")),
        ]
    )

    done = next(f for f in frames if f["type"] == "done")
    assert sorted(done) == sorted(_pinned("done"))


def test_a_citation_serialises_as_the_fixture_pins():
    """`[c.__dict__ for c in item.citations]` -- the attribute names are the wire names."""
    citation = Citation(chunk_id="c", document_id="d", source="s", section_path=None)

    assert sorted(citation.__dict__) == sorted(_pinned("done")["citations"][0])


def test_usage_serialises_as_the_fixture_pins():
    assert sorted(Usage().__dict__) == sorted(_pinned("done")["usage"])


def test_the_fixtures_decisions_are_ones_the_loop_can_emit():
    """`decision` is a bare string on the wire, so an invented value would go unnoticed."""
    emitted = {frame["decision"] for frame in _terminals() if "decision" in frame}

    assert emitted <= {"answered", "tool_loop_exhausted"}


def test_the_give_up_answer_is_the_marker_the_prompt_defines():
    given_up = [frame for frame in _terminals() if frame.get("idk")]

    assert given_up, "the fixture should cover the give-up path"
    for frame in given_up:
        assert frame["answer"] == IDK_MARKER


def test_a_tool_call_entry_matches_the_trace_the_loop_appends():
    calls = [call for frame in _terminals() for call in frame.get("tool_calls", [])]

    assert calls, "the fixture should cover at least one tool hop"
    for call in calls:
        assert set(call) <= {"name", "args", "is_error", "error"}
        assert {"name", "args", "is_error"} <= set(call)
        # `error` rides along only on a failed call.
        assert ("error" in call) == call["is_error"]


def test_the_tolerated_frames_omit_only_what_chat_ignores():
    """Chat reads `type`, `answer` and `citations` off a terminal frame; the rest is
    emitted and parsed by nobody, so a frame without it must still be valid.
    """
    consumed = set(_FIXTURE["consumed"]["done"])

    for case in _FIXTURE["tolerated"]:
        frame = case["frame"]
        if frame["type"] == "done":
            assert set(frame) <= consumed, case["name"]
