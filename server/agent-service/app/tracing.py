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
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_endpoint))
        )
    else:
        # Local dev: emit compact one-line spans immediately (no batching delay).
        provider.add_span_processor(SimpleSpanProcessor(_CompactConsoleSpanExporter()))

    trace.set_tracer_provider(provider)


def tracer():
    return trace.get_tracer("agent-service")
