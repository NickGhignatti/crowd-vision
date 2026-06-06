from __future__ import annotations

import sys
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

from app.config import get_settings

if TYPE_CHECKING:
    from collections.abc import Sequence

    from opentelemetry.sdk.trace import ReadableSpan


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
        # Pick the OTLP transport by protocol. Langfuse ingests OTLP/HTTP at
        # /api/public/otel (the HTTP exporter appends /v1/traces) and reads the
        # Basic-auth header from OTEL_EXPORTER_OTLP_HEADERS; gRPC stays the default
        # for plain OTel collectors.
        if settings.otel_protocol.lower().startswith("http"):
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        else:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        # Construct with no args so endpoint + headers come from the standard
        # OTEL_EXPORTER_OTLP_* env vars. This matters for the HTTP exporter: reading
        # the endpoint from env appends the "/v1/traces" path (Langfuse's OTLP ingest
        # lives at <endpoint>/v1/traces), whereas passing endpoint= would use it
        # verbatim and 404.
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
    import json

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
