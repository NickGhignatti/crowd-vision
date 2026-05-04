from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.agent.llm.base import ChatTurn as LLMChatTurn
from app.agent.llm.base import CompletionUsage
from app.agent.loop import Agent
from app.auth import AuthUser


class _RecordingLLM:
    """Captures the messages it's asked to chat() with, then returns a final answer."""

    model = "fake-llm"

    def __init__(self) -> None:
        self.last_messages: list[dict] | None = None

    async def chat(
        self, messages: list[dict], tools: Any = None, temperature: float = 0.2
    ) -> LLMChatTurn:
        self.last_messages = list(messages)
        return LLMChatTurn(
            text="final answer",
            tool_calls=[],
            usage=CompletionUsage(input_tokens=1, output_tokens=1, cost_usd=0.0),
            model=self.model,
        )

    async def complete(self, *args: Any, **kwargs: Any) -> Any:  # pragma: no cover
        raise NotImplementedError

    async def stream(self, *args: Any, **kwargs: Any) -> Any:  # pragma: no cover
        raise NotImplementedError


@pytest.mark.asyncio
async def test_history_is_spliced_between_system_and_current_question():
    llm = _RecordingLLM()
    agent = Agent(llm=llm)
    user = AuthUser(user_id="u1", roles=[], domains=["acme"])
    history = [
        {"role": "user", "content": "What buildings exist in domain acme?"},
        {"role": "assistant", "content": "Acme has one building: HQ (id b-42)."},
    ]

    await agent.answer(
        session=AsyncMock(),
        question="And how many rooms does it have?",
        user=user,
        history=history,
    )

    assert llm.last_messages is not None
    roles = [m["role"] for m in llm.last_messages]
    assert roles == ["system", "user", "assistant", "user"]
    assert llm.last_messages[1]["content"] == "What buildings exist in domain acme?"
    assert llm.last_messages[2]["content"] == "Acme has one building: HQ (id b-42)."
    assert llm.last_messages[3]["content"] == "And how many rooms does it have?"


@pytest.mark.asyncio
async def test_no_history_yields_just_system_and_question():
    llm = _RecordingLLM()
    agent = Agent(llm=llm)
    user = AuthUser(user_id="u1", roles=[], domains=["acme"])

    await agent.answer(session=AsyncMock(), question="hi", user=user)

    assert llm.last_messages is not None
    assert [m["role"] for m in llm.last_messages] == ["system", "user"]
    assert llm.last_messages[1]["content"] == "hi"
