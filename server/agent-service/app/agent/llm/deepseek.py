from __future__ import annotations

import json
from typing import TYPE_CHECKING, cast

from openai import AsyncOpenAI

from app.agent.llm.base import ChatTurn, Completion, CompletionUsage, ToolCall, ToolSchema
from app.agent.llm.pricing import estimate_cost
from app.config import get_settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolUnionParam


class DeepSeekClient:
    def __init__(self, model: str | None = None) -> None:
        settings = get_settings()
        self._client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=settings.llm_timeout_seconds,
        )
        self.model = model or settings.router_model

    async def complete(self, messages: list[dict], temperature: float = 0.2) -> Completion:
        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=cast("list[ChatCompletionMessageParam]", messages),
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
            messages=cast("list[ChatCompletionMessageParam]", messages),
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

        # DeepSeek/OpenAI expect `tool_calls` on assistant turns and a `tool` role
        # with `tool_call_id`. Our internal format already matches, so pass through.
        oai_messages = list(messages)

        resp = await self._client.chat.completions.create(
            model=self.model,
            messages=cast("list[ChatCompletionMessageParam]", oai_messages),
            temperature=temperature,
            tools=cast("list[ChatCompletionToolUnionParam] | None", oai_tools),
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
