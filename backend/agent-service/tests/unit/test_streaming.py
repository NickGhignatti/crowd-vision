import pytest

from app.agent.llm.base import ChatTurn, CompletionUsage, TextDelta, ToolCall
from app.agent.loop import Agent
from app.auth import AuthUser
from app.config import get_settings


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def turn(text="", tool_calls=None, input_tokens=0, output_tokens=0, cost=0.0):
    return ChatTurn(
        text=text,
        tool_calls=tool_calls or [],
        usage=CompletionUsage(input_tokens, output_tokens, cost),
        model="fake-model",
    )


class FakeLLM:
    """Scripted client. Each hop is a (deltas, ChatTurn) pair; the streaming path
    replays the deltas, the buffered path skips straight to the turn."""

    model = "fake-model"

    def __init__(self, hops):
        self._hops = list(hops)
        self.chat_calls = 0
        self.stream_calls = 0
        self.tools_seen = []

    async def complete(self, messages, temperature=None):  # pragma: no cover - unused
        raise AssertionError("the loop must not call complete()")

    async def chat(self, messages, tools=None, temperature=None):
        self.chat_calls += 1
        self.tools_seen.append(tools)
        return self._hops.pop(0)[1]

    async def stream_chat(self, messages, tools=None, temperature=None):
        self.stream_calls += 1
        self.tools_seen.append(tools)
        deltas, finished = self._hops.pop(0)
        for delta in deltas:
            yield TextDelta(delta)
        yield finished


async def collect(agent, llm, question="which room is full?"):
    events = []
    async for event in agent.stream_answer(None, question, AuthUser("user-1"), llm=llm):
        events.append(event)
    return events


def tokens(events):
    return "".join(e["text"] for e in events if e["type"] == "token")


def done(events):
    return next(e for e in events if e["type"] == "done")


@pytest.mark.asyncio
async def test_a_single_hop_answer_arrives_one_token_at_a_time():
    llm = FakeLLM([(["Room ", "B2 ", "is full."], turn(text="Room B2 is full."))])

    events = await collect(Agent(llm=llm), llm)

    assert [e["type"] for e in events] == ["token", "token", "token", "done"]
    assert [e["text"] for e in events[:3]] == ["Room ", "B2 ", "is full."]
    assert done(events)["answer"] == "Room B2 is full."


@pytest.mark.asyncio
async def test_the_answer_after_a_tool_call_still_streams():
    llm = FakeLLM(
        [
            ([], turn(tool_calls=[ToolCall(id="1", name="unknown_tool", arguments={})])),
            (["The ", "answer."], turn(text="The answer.")),
        ]
    )

    events = await collect(Agent(llm=llm), llm)

    assert tokens(events) == "The answer."
    assert done(events)["answer"] == "The answer."
    assert done(events)["tool_calls"][0]["name"] == "unknown_tool"


@pytest.mark.asyncio
async def test_the_terminal_frame_carries_the_cleaned_answer_not_the_raw_tokens():
    raw = "Rooms are full [^deadbeefdeadbeef] today."
    llm = FakeLLM([(["Rooms are full [^deadbeefdeadbeef]", " today."], turn(text=raw))])

    events = await collect(Agent(llm=llm), llm)

    assert "[^deadbeefdeadbeef]" in tokens(events), "raw tokens are forwarded as generated"
    # strip_hallucinated removes the marker and leaves the spaces that surrounded it.
    assert done(events)["answer"] == "Rooms are full  today."
    assert "[^deadbeefdeadbeef]" not in done(events)["answer"]
    assert done(events)["hallucinated_citations"] == ["deadbeefdeadbeef"]


@pytest.mark.asyncio
async def test_usage_is_summed_across_every_hop_of_a_streamed_run():
    llm = FakeLLM(
        [
            (
                [],
                turn(
                    tool_calls=[ToolCall(id="1", name="unknown_tool", arguments={})],
                    input_tokens=10,
                    output_tokens=2,
                    cost=0.01,
                ),
            ),
            (["done"], turn(text="done", input_tokens=30, output_tokens=5, cost=0.02)),
        ]
    )

    events = await collect(Agent(llm=llm), llm)

    assert done(events)["usage"] == {
        "input_tokens": 40,
        "output_tokens": 7,
        "cost_usd": pytest.approx(0.03),
    }


@pytest.mark.asyncio
async def test_an_exhausted_tool_loop_still_terminates_the_stream():
    hops = get_settings().max_tool_hops
    calling = ([], turn(tool_calls=[ToolCall(id="1", name="unknown_tool", arguments={})]))
    llm = FakeLLM([calling] * hops)

    events = await collect(Agent(llm=llm), llm)

    assert done(events)["decision"] == "tool_loop_exhausted"
    assert done(events)["idk"] is True


@pytest.mark.asyncio
async def test_the_buffered_path_never_opens_a_stream():
    llm = FakeLLM([(["ignored"], turn(text="Room B2 is full."))])

    result = await Agent(llm=llm).answer(None, "which room?", AuthUser("user-1"), llm=llm)

    assert result.answer == "Room B2 is full."
    assert llm.chat_calls == 1
    assert llm.stream_calls == 0, "evals and /ask?stream=false stay on the buffered call"


@pytest.mark.asyncio
async def test_tools_are_offered_on_the_streaming_path_too():
    llm = FakeLLM([(["hi"], turn(text="hi"))])

    await collect(Agent(llm=llm), llm)

    assert llm.tools_seen[0], "the model must still be able to call tools while streaming"
