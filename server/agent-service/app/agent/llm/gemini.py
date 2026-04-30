from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from google import genai
from google.genai import types as genai_types

from app.agent.llm.base import ChatTurn, Completion, CompletionUsage, ToolCall, ToolSchema
from app.agent.llm.pricing import estimate_cost
from app.config import get_settings

if TYPE_CHECKING:
    from collections.abc import AsyncIterator


def _split_system(messages: list[dict]) -> tuple[str | None, list[dict]]:
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    rest = [m for m in messages if m["role"] != "system"]
    system = "\n\n".join(system_parts) if system_parts else None
    return system, rest


def _to_contents(messages: list[dict]) -> list[genai_types.Content]:
    """Translate our internal message list to Gemini Contents.

    Internal roles: 'system' (handled separately), 'user', 'assistant', 'tool'.
    Assistant turns may carry tool_calls; tool turns carry tool_call_id + content.
    """
    contents: list[genai_types.Content] = []
    for m in messages:
        role = m["role"]
        if role == "system":
            continue
        if role == "tool":
            contents.append(
                genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part.from_function_response(
                            name=m["name"],
                            response={"result": m["content"]},
                        )
                    ],
                )
            )
            continue

        gemini_role = "user" if role == "user" else "model"
        parts: list[genai_types.Part] = []
        if m.get("content"):
            parts.append(genai_types.Part(text=m["content"]))
        for call in m.get("tool_calls", []) or []:
            parts.append(
                genai_types.Part.from_function_call(
                    name=call["name"], args=call.get("arguments", {}) or {}
                )
            )
        if not parts:
            parts.append(genai_types.Part(text=""))
        contents.append(genai_types.Content(role=gemini_role, parts=parts))
    return contents


def _tools_to_genai(tools: list[ToolSchema]) -> list[genai_types.Tool]:
    decls = [
        genai_types.FunctionDeclaration(
            name=t.name,
            description=t.description,
            parameters=t.parameters,
        )
        for t in tools
    ]
    return [genai_types.Tool(function_declarations=decls)]


class GeminiClient:
    def __init__(self, model: str | None = None) -> None:
        settings = get_settings()
        self._client = genai.Client(api_key=settings.google_api_key)
        self.model = model or settings.answer_model
        self._timeout = settings.llm_timeout_seconds

    async def complete(self, messages: list[dict], temperature: float = 0.2) -> Completion:
        system, rest = _split_system(messages)
        contents = _to_contents(rest)
        config = genai_types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
        )

        def _call():
            return self._client.models.generate_content(
                model=self.model, contents=contents, config=config
            )

        resp = await asyncio.wait_for(asyncio.to_thread(_call), timeout=self._timeout)
        text = resp.text or ""
        usage_meta = getattr(resp, "usage_metadata", None)
        input_tokens = getattr(usage_meta, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage_meta, "candidates_token_count", 0) or 0
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
        system, rest = _split_system(messages)
        contents = _to_contents(rest)
        config = genai_types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
        )

        loop = asyncio.get_running_loop()

        def _start():
            return self._client.models.generate_content_stream(
                model=self.model, contents=contents, config=config
            )

        iterator = await loop.run_in_executor(None, _start)

        def _next(it):
            try:
                return next(it)
            except StopIteration:
                return None

        while True:
            chunk = await loop.run_in_executor(None, _next, iterator)
            if chunk is None:
                return
            if getattr(chunk, "text", None):
                yield chunk.text

    async def chat(
        self,
        messages: list[dict],
        tools: list[ToolSchema] | None = None,
        temperature: float = 0.2,
    ) -> ChatTurn:
        system, rest = _split_system(messages)
        contents = _to_contents(rest)
        config = genai_types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            tools=_tools_to_genai(tools) if tools else None,
        )

        def _call():
            return self._client.models.generate_content(
                model=self.model, contents=contents, config=config
            )

        resp = await asyncio.wait_for(asyncio.to_thread(_call), timeout=self._timeout)

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        candidates = getattr(resp, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            for part in getattr(content, "parts", []) or []:
                if getattr(part, "text", None):
                    text_parts.append(part.text)
                fc = getattr(part, "function_call", None)
                if fc is not None:
                    tool_calls.append(
                        ToolCall(
                            id=f"call_{len(tool_calls)}",
                            name=fc.name,
                            arguments=dict(fc.args or {}),
                        )
                    )

        usage_meta = getattr(resp, "usage_metadata", None)
        input_tokens = getattr(usage_meta, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage_meta, "candidates_token_count", 0) or 0
        return ChatTurn(
            text="".join(text_parts),
            tool_calls=tool_calls,
            usage=CompletionUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=estimate_cost(self.model, input_tokens, output_tokens),
            ),
            model=self.model,
        )
