from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.agent.llm import OpenAICompatClient
from app.agent.prompts import IDK_MARKER, SYSTEM_PROMPT
from app.agent.tools import REGISTRY, ToolContext, ToolResult
from app.citations import Citation, extract_citations, strip_hallucinated
from app.config import get_settings
from app.logging import get_logger
from app.retrieval.pipeline import RetrievedChunk
from app.tracing import tracer

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.agent.llm.base import LLMClient
    from app.auth import AuthUser

log = get_logger(__name__)


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0

    def add(self, i: int, o: int, c: float) -> None:
        self.input_tokens += i
        self.output_tokens += o
        self.cost_usd += c


@dataclass
class AnswerResult:
    answer: str
    citations: list[Citation]
    retrieved: list[RetrievedChunk]
    usage: Usage
    idk: bool = False
    decision: str = "answered"
    hallucinated_citations: list[str] = field(default_factory=list)
    tool_calls: list[dict] = field(default_factory=list)


class Agent:
    """Tool-calling agent. The LLM decides which tools to invoke; the loop runs them
    and feeds results back until the model produces a final natural-language answer
    or we hit the hop limit."""

    def __init__(self, llm: LLMClient | None = None) -> None:
        self._settings = get_settings()
        self._llm = llm or OpenAICompatClient()

    def _bootstrap_messages(self, user: AuthUser, question: str) -> list[dict]:
        # Inject lightweight user context so the model knows whose data it can ask for.
        scope = (
            f"Caller domains: {user.domains or ['(none)']}. "
            f"Caller roles: {user.roles or ['(none)']}."
        )
        return [
            {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + scope},
            {"role": "user", "content": question},
        ]

    async def _run_tool_calls(self, ctx: ToolContext, calls: list, trace: list[dict]) -> list[dict]:
        """Execute tool calls; return new 'tool' messages to append to history."""
        out_messages: list[dict] = []
        for call in calls:
            tool = REGISTRY.get(call.name)
            if tool is None:
                content = f"unknown tool: {call.name}"
                trace.append({"name": call.name, "args": call.arguments, "error": content})
                out_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": call.name,
                        "content": content,
                    }
                )
                continue
            try:
                args = tool.Args(**call.arguments)
            except Exception as e:
                content = f"invalid arguments: {e}"
                trace.append({"name": call.name, "args": call.arguments, "error": content})
                out_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": call.name,
                        "content": content,
                    }
                )
                continue

            tr = tracer()
            with tr.start_as_current_span(f"tool.{call.name}") as span:
                span.set_attribute("tool.name", call.name)
                try:
                    result = await tool.run(args, ctx)
                except Exception as e:
                    log.exception("tool.error", tool=call.name)
                    result = ToolResult(
                        content=f"tool {call.name} failed: {type(e).__name__}: {e}",
                        is_error=True,
                    )
                span.set_attribute("tool.is_error", bool(result.is_error))

            ctx.citations.extend(result.citations or [])
            trace.append(
                {
                    "name": call.name,
                    "args": call.arguments,
                    "is_error": result.is_error,
                }
            )
            out_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "name": call.name,
                    "content": json.dumps(result.content)
                    if not isinstance(result.content, str)
                    else result.content,
                }
            )
        return out_messages

    async def answer(
        self,
        session: AsyncSession,
        question: str,
        user: AuthUser,
        llm: LLMClient | None = None,
    ) -> AnswerResult:
        # `llm` lets a caller pick a model per request (multi-model eval); defaults
        # to the agent's configured client.
        llm = llm or self._llm
        usage = Usage()
        ctx = ToolContext(user=user, session=session)
        messages = self._bootstrap_messages(user, question)
        tool_trace: list[dict] = []
        tools = REGISTRY.schemas()
        tr = tracer()

        with tr.start_as_current_span("agent.answer") as root:
            # Trace-level IO so the run is readable at a glance in the backend.
            root.set_attribute("langfuse.trace.input", question)
            root.set_attribute("langfuse.user.id", user.user_id)
            root.set_attribute("gen_ai.request.model", llm.model)
            # Tag the trace with the model so eval sweeps can filter/group by it.
            root.set_attribute("langfuse.trace.tags", json.dumps([f"model:{llm.model}"]))

            for hop in range(self._settings.max_tool_hops):
                with tr.start_as_current_span(f"agent.hop.{hop}") as hop_span:
                    hop_span.set_attribute("agent.hop", hop)
                    turn = await llm.chat(messages, tools=tools)
                    usage.add(
                        turn.usage.input_tokens, turn.usage.output_tokens, turn.usage.cost_usd
                    )
                    hop_span.set_attribute("agent.hop.input_tokens", turn.usage.input_tokens)
                    hop_span.set_attribute("agent.hop.output_tokens", turn.usage.output_tokens)
                    hop_span.set_attribute("agent.hop.tool_calls", len(turn.tool_calls))

                if not turn.tool_calls:
                    full_text = turn.text or ""
                    doc_citations = [c for c in ctx.citations if isinstance(c, RetrievedChunk)]
                    valid, hallucinated = extract_citations(full_text, doc_citations)
                    cleaned = strip_hallucinated(full_text, hallucinated)
                    self._tag_run(root, answer=cleaned, usage=usage, decision="answered")
                    return AnswerResult(
                        answer=cleaned,
                        citations=valid,
                        retrieved=doc_citations,
                        usage=usage,
                        idk=cleaned.strip() == IDK_MARKER,
                        hallucinated_citations=hallucinated,
                        tool_calls=tool_trace,
                    )

                # Append the assistant turn (with its tool_calls) and the tool results.
                messages.append(
                    {
                        "role": "assistant",
                        "content": turn.text,
                        "tool_calls": [
                            {"id": c.id, "name": c.name, "arguments": c.arguments}
                            for c in turn.tool_calls
                        ],
                    }
                )
                tool_messages = await self._run_tool_calls(ctx, turn.tool_calls, tool_trace)
                messages.extend(tool_messages)

            log.warning("agent.tool_loop_exhausted", hops=self._settings.max_tool_hops)
            self._tag_run(root, answer=IDK_MARKER, usage=usage, decision="tool_loop_exhausted")
            return AnswerResult(
                answer=IDK_MARKER,
                citations=[],
                retrieved=[c for c in ctx.citations if isinstance(c, RetrievedChunk)],
                usage=usage,
                idk=True,
                decision="tool_loop_exhausted",
                tool_calls=tool_trace,
            )

    @staticmethod
    def _tag_run(span, *, answer: str, usage: Usage, decision: str) -> None:
        """Set trace-level output + aggregate token/cost totals on the root span."""
        span.set_attribute("langfuse.trace.output", answer)
        span.set_attribute("agent.decision", decision)
        span.set_attribute("gen_ai.usage.input_tokens", usage.input_tokens)
        span.set_attribute("gen_ai.usage.output_tokens", usage.output_tokens)
        span.set_attribute("gen_ai.usage.cost_usd", usage.cost_usd)

    async def stream_answer(
        self,
        session: AsyncSession,
        question: str,
        user: AuthUser,
        llm: LLMClient | None = None,
    ) -> AsyncIterator[dict]:
        """Run the tool loop, then stream the final answer text token by token.

        Tool-calling and streaming are awkward together across providers; we pay one
        non-streamed final hop's cost in exchange for a uniform implementation."""
        result = await self.answer(session, question, user, llm=llm)

        # Emit the answer as a single token event for now. (Real per-token streaming
        # of the *final* turn is a follow-up: re-run a no-tools `stream()` with the
        # accumulated message history.)
        if result.answer:
            yield {"type": "token", "text": result.answer}

        yield {
            "type": "done",
            "citations": [c.__dict__ for c in result.citations],
            "retrieved_ids": [c.id for c in result.retrieved],
            "usage": result.usage.__dict__,
            "idk": result.idk,
            "decision": result.decision,
            "tool_calls": result.tool_calls,
            "hallucinated_citations": result.hallucinated_citations,
        }
