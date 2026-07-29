from __future__ import annotations

import json
import sys
from dataclasses import asdict, is_dataclass
from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    SimpleSpanProcessor,
    SpanExporter,
    SpanExportResult,
)
from opentelemetry.trace import Status, StatusCode
from pydantic import BaseModel

from app.config import get_settings

if TYPE_CHECKING:
    from collections.abc import Sequence

    from opentelemetry.sdk.trace import ReadableSpan

    from app.retrieval.pipeline import RetrievedChunk

_MAX_STRING_PREVIEW = 200
_MAX_PAYLOAD_LENGTH = 8000


def _json_default(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump()
    if is_dataclass(value) and not isinstance(value, type):
        return asdict(value)
    return str(value)


def _compact_payload(value: object) -> object:
    if isinstance(value, str):
        if len(value) <= _MAX_STRING_PREVIEW:
            return value
        return value[:_MAX_STRING_PREVIEW] + "...[truncated]"
    if isinstance(value, dict):
        return {str(key): _compact_payload(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_compact_payload(item) for item in value]
    if isinstance(value, BaseModel):
        return _compact_payload(value.model_dump())
    if is_dataclass(value) and not isinstance(value, type):
        return _compact_payload(asdict(value))
    return value


def _bounded_json(value: object) -> str:
    """Serialize trace payloads safely while bounding previews and total size."""
    encoded = json.dumps(
        _compact_payload(value),
        default=_json_default,
        ensure_ascii=True,
        separators=(",", ":"),
    )
    if len(encoded) <= _MAX_PAYLOAD_LENGTH:
        return encoded
    return json.dumps(
        {
            "truncated": True,
            "preview": encoded[: _MAX_PAYLOAD_LENGTH - 100],
        },
        ensure_ascii=True,
        separators=(",", ":"),
    )


def _retriever_docs(docs: Sequence[RetrievedChunk]) -> list[dict]:
    return [
        {
            "id": doc.id,
            "source": doc.source,
            "section": doc.section_path,
            "score": round(doc.score, 6),
            "content": doc.content,
        }
        for doc in docs
    ]


def tag_retriever(
    span: trace.Span,
    *,
    query: str,
    output_docs: Sequence[RetrievedChunk],
    input_docs: Sequence[RetrievedChunk] | None = None,
) -> None:
    """Mark a retrieval stage and attach bounded query/candidate payloads."""
    span.set_attribute("langfuse.observation.type", "retriever")
    if not get_settings().observe_payloads:
        return

    input_payload: object = query
    if input_docs is not None:
        input_payload = {"query": query, "documents": _retriever_docs(input_docs)}
    span.set_attribute("langfuse.observation.input", _bounded_json(input_payload))
    span.set_attribute(
        "langfuse.observation.output",
        _bounded_json(_retriever_docs(output_docs)),
    )


def tag_tool(
    span: trace.Span,
    *,
    args: object,
    output: object,
    is_error: bool,
    exception: BaseException | None = None,
) -> None:
    """Mark a tool observation, attach bounded payloads, and surface failures."""
    span.set_attribute("langfuse.observation.type", "tool")
    span.set_attribute("tool.is_error", is_error)
    if get_settings().observe_payloads:
        span.set_attribute("langfuse.observation.input", _bounded_json(args))
        span.set_attribute("langfuse.observation.output", _bounded_json(output))
    if exception is not None:
        span.record_exception(exception)
    if is_error:
        span.set_status(Status(StatusCode.ERROR))


class _CompactConsoleSpanExporter(SpanExporter):
    """Print one terse line per span instead of OpenTelemetry's multi-line JSON.

    Used in local dev (no OTLP collector) to keep traces glanceable, e.g.:
        trace POST /ask 200 142.3ms
        trace agent.hop.0 11.8ms
    """

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        for span in spans:
            start = span.start_time or 0
            end = span.end_time or start
            duration_ms = (end - start) / 1_000_000
            status = (span.attributes or {}).get("http.status_code")
            suffix = f" {status}" if status is not None else ""
            sys.stdout.write(f"trace {span.name}{suffix} {duration_ms:.1f}ms\n")
        sys.stdout.flush()
        return SpanExportResult.SUCCESS

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return True

    def shutdown(self) -> None:
        return None


def configure_tracing() -> None:
    settings = get_settings()
    resource = Resource.create({"service.name": "agent-service"})
    provider = TracerProvider(resource=resource)

    if settings.otel_endpoint:
        # Pick OTLP transport by protocol: Langfuse ingests OTLP/HTTP; gRPC is the
        # default for plain OTel collectors.
        if settings.otel_protocol.lower().startswith("http"):
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        else:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        # No-args construction reads endpoint/headers from OTEL_EXPORTER_OTLP_* env;
        # the HTTP exporter needs this to append "/v1/traces" (passing endpoint= 404s).
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    else:
        # Local dev: emit compact one-line spans immediately (no batching delay).
        provider.add_span_processor(SimpleSpanProcessor(_CompactConsoleSpanExporter()))

    trace.set_tracer_provider(provider)

    # Auto-instrument outbound httpx calls (twin-service tools) so each shows up as
    # its own client span — method, URL, status, latency — nested under tool.*.
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

    HTTPXClientInstrumentor().instrument()


def tracer():
    return trace.get_tracer("agent-service")


def tag_generation(
    span: trace.Span,
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
) -> None:
    """Mark a span as an LLM generation with tokens + cost.

    Sets both the vendor-neutral OTel GenAI semantic-convention attributes and the
    Langfuse-specific mapping so the span renders as a "generation" with token and
    cost columns in Langfuse's trace waterfall.
    """
    span.set_attribute("langfuse.observation.type", "generation")
    span.set_attribute("gen_ai.request.model", model)
    span.set_attribute("gen_ai.response.model", model)
    span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
    span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
    # Langfuse reads these JSON blobs for the usage/cost breakdown.
    span.set_attribute(
        "langfuse.observation.usage_details",
        json.dumps({"input": input_tokens, "output": output_tokens}),
    )
    span.set_attribute(
        "langfuse.observation.cost_details",
        json.dumps({"total": cost_usd}),
    )
