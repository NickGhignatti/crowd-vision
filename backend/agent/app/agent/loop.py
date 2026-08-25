from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from app.agent.llm import OpenAICompatClient
from app.agent.llm.base import ChatTurn, TextDelta
from app.agent.prompts import IDK_MARKER, SYSTEM_PROMPT
from app.agent.tools import REGISTRY, ToolContext, ToolResult
from app.citations import Citation, extract_citations, strip_hallucinated
from app.config import get_settings
from app.logging import get_logger
from app.retrieval.pipeline import RetrievedChunk
from app.tracing import tag_tool, tracer

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

    def _bootstrap_messages(
        self,
        user: AuthUser,
        question: str,
        history: list[dict] | None = None,
    ) -> list[dict]:
        # Inject lightweight user context so the model knows whose data it can ask for.
        scope = (
            f"Caller domains: {user.domains or ['(none)']}. "
            f"Caller roles: {user.roles or ['(none)']}."
        )
        messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + scope}]
        messages.extend(history or [])
        messages.append({"role": "user", "content": question})
        return messages

    async def _run_tool_calls(self, ctx: ToolContext, calls: list, trace: list[dict]) -> list[dict]:
        """Execute tool calls; return new 'tool' messages to append to history."""
        out_messages: list[dict] = []
        for call in calls:
            tr = tracer()
            with tr.start_as_current_span(f"tool.{call.name}") as span:
                span.set_attribute("tool.name", call.name)
                exception: BaseException | None = None
                tool = REGISTRY.get(call.name)
                if tool is None:
                    result = ToolResult(
                        content=f"unknown tool: {call.name}",
                        is_error=True,
                    )
                else:
                    try:
                        args = tool.Args(**call.arguments)
                    except Exception as e:
                        exception = e
                        result = ToolResult(content=f"invalid arguments: {e}", is_error=True)
                    else:
                        try:
                            result = await tool.run(args, ctx)
                        except Exception as e:
                            log.exception("tool.error", tool=call.name)
                            exception = e
                            result = ToolResult(
                                content=f"tool {call.name} failed: {type(e).__name__}: {e}",
                                is_error=True,
                            )
                tag_tool(
                    span,
                    args=call.arguments,
                    output=result.content,
                    is_error=result.is_error,
                    exception=exception,
                )

            ctx.citations.extend(result.citations or [])
            trace.append(
                {
                    "name": call.name,
                    "args": call.arguments,
                    "is_error": result.is_error,
                    **({"error": result.content} if result.is_error else {}),
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

    async def _run(
        self,
        session: AsyncSession,
        question: str,
        user: AuthUser,
        llm: LLMClient | None = None,
        history: list[dict] | None = None,
        *,
        stream: bool = False,
    ) -> AsyncIterator[TextDelta | AnswerResult]:
        """The tool loop, shared by both callers, yielding an `AnswerResult` last.

        `stream=True` swaps the per-hop call for its streaming twin and forwards each
        `TextDelta` on the way through; everything else — hop limit, citation
        checking, tracing, usage accounting — is the same code either way, so the
        buffered and streamed paths cannot drift apart.
        """
        # `llm` lets a caller pick a model per request (multi-model eval); defaults
        # to the agent's configured client.
        llm = llm or self._llm
        usage = Usage()
        ctx = ToolContext(user=user, session=session)
        messages = self._bootstrap_messages(user, question, history)
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
                    if stream:
                        turn = ChatTurn(text="")
                        async for item in llm.stream_chat(messages, tools=tools):
                            if isinstance(item, ChatTurn):
                                turn = item
                            else:
                                yield item
                    else:
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
                    yield AnswerResult(
                        answer=cleaned,
                        citations=valid,
                        retrieved=doc_citations,
                        usage=usage,
                        idk=cleaned.strip() == IDK_MARKER,
                        hallucinated_citations=hallucinated,
                        tool_calls=tool_trace,
                    )
                    return

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
            yield AnswerResult(
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

    async def answer(
        self,
        session: AsyncSession,
        question: str,
        user: AuthUser,
        llm: LLMClient | None = None,
        history: list[dict] | None = None,
    ) -> AnswerResult:
        """Run the loop to completion and return the whole answer at once."""
        result: AnswerResult | None = None
        async for item in self._run(session, question, user, llm=llm, history=history):
            if isinstance(item, AnswerResult):
                result = item
        assert result is not None, "the loop always yields a result"
        return result

    async def stream_answer(
        self,
        session: AsyncSession,
        question: str,
        user: AuthUser,
        llm: LLMClient | None = None,
        history: list[dict] | None = None,
    ) -> AsyncIterator[dict]:
        """Run the loop, emitting the final answer token by token as it is generated.

        `answer` on the terminal event — not the concatenated tokens — is the
        authoritative text. The two differ whenever the loop rewrites what the model
        produced: hallucinated citation markers are stripped afterwards, and a hop
        that opens with a preamble before calling a tool has already streamed words
        that are no part of the answer. Consumers must persist and display `answer`.
        """
        async for item in self._run(session, question, user, llm=llm, history=history, stream=True):
            if isinstance(item, TextDelta):
                yield {"type": "token", "text": item.text}
                continue

            yield {
                "type": "done",
                "answer": item.answer,
                "citations": [c.__dict__ for c in item.citations],
                "retrieved_ids": [c.id for c in item.retrieved],
                "usage": item.usage.__dict__,
                "idk": item.idk,
                "decision": item.decision,
                "tool_calls": item.tool_calls,
                "hallucinated_citations": item.hallucinated_citations,
            }
