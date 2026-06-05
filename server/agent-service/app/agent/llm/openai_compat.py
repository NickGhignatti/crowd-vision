from __future__ import annotations

import json
from typing import TYPE_CHECKING, cast

from openai import AsyncOpenAI, omit

from app.agent.llm.base import ChatTurn, Completion, CompletionUsage, ToolCall, ToolSchema
from app.agent.llm.pricing import estimate_cost
from app.config import get_settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolUnionParam


def _to_openai_messages(messages: list[dict]) -> list[dict]:
    """Translate our internal message list to the OpenAI Chat Completions schema.

    Internal format keeps tool calls flat — assistant turns carry
    `tool_calls: [{id, name, arguments(dict)}]` and tool results use the `tool`
    role with `tool_call_id`. OpenAI instead nests each call under
    `function: {name, arguments(JSON string)}`, so we convert here rather than
    leaking provider shapes into the agent loop.
    """
    out: list[dict] = []
    for m in messages:
        role = m.get("role")
        if role == "assistant" and m.get("tool_calls"):
            out.append(
                {
                    "role": "assistant",
                    # OpenAI wants null (not "") content when tool calls are present.
                    "content": m.get("content") or None,
                    "tool_calls": [
                        {
                            "id": c["id"],
                            "type": "function",
                            "function": {
                                "name": c["name"],
                                "arguments": json.dumps(c.get("arguments") or {}),
                            },
                        }
                        for c in m["tool_calls"]
                    ],
                }
            )
        elif role == "tool":
            out.append(
                {
                    "role": "tool",
                    "tool_call_id": m["tool_call_id"],
                    "content": m.get("content", ""),
                }
            )
        else:
            out.append({"role": role, "content": m.get("content", "")})
    return out


class OpenAICompatClient:
    """Chat client for any OpenAI-compatible endpoint (OpenRouter, OpenAI, …).

    Provider- and model-agnostic: the concrete model is whatever `ANSWER_MODEL`
    points at, routed through `LLM_BASE_URL` with `llm_api_key`.
    """

    def __init__(self, model: str | None = None) -> None:
        settings = get_settings()
        self._client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            timeout=settings.llm_timeout_seconds,
        )
        self.model = model or settings.answer_model

    async def complete(self, messages: list[dict], temperature: float = 0.2) -> Completion:
        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=cast("list[ChatCompletionMessageParam]", _to_openai_messages(messages)),
            temperature=temperature,
        )
        text = resp.choices[0].message.content or ""
        input_tokens = resp.usage.prompt_tokens if resp.usage else 0
        output_tokens = resp.usage.completion_tokens if resp.usage else 0
        return Completion(
            text=text,
            usage=CompletionUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=estimate_cost(self.model, input_tokens, output_tokens),
            ),
            model=self.model,
        )

    async def stream(self, messages: list[dict], temperature: float = 0.2) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self.model,
            messages=cast("list[ChatCompletionMessageParam]", _to_openai_messages(messages)),
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    async def chat(
        self,
        messages: list[dict],
        tools: list[ToolSchema] | None = None,
        temperature: float = 0.2,
    ) -> ChatTurn:
        oai_tools = (
            [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ]
            if tools
            else None
        )

        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=cast("list[ChatCompletionMessageParam]", _to_openai_messages(messages)),
            temperature=temperature,
            tools=cast("list[ChatCompletionToolUnionParam]", oai_tools) if oai_tools else omit,
        )
        msg = resp.choices[0].message
        calls: list[ToolCall] = []
        for tc in getattr(msg, "tool_calls", None) or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args))

        input_tokens = resp.usage.prompt_tokens if resp.usage else 0
        output_tokens = resp.usage.completion_tokens if resp.usage else 0
        return ChatTurn(
            text=msg.content or "",
            tool_calls=calls,
            usage=CompletionUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=estimate_cost(self.model, input_tokens, output_tokens),
            ),
            model=self.model,
        )
