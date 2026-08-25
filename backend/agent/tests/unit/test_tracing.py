import json

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from app.config import get_settings
from app.retrieval.pipeline import RetrievedChunk
from app.tracing import _bounded_json, tag_retriever, tag_tool


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    monkeypatch.setenv("OBSERVE_PAYLOADS", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def spans():
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    yield provider.get_tracer("test"), exporter
    provider.shutdown()


def _chunk(chunk_id: str, content: str = "content") -> RetrievedChunk:
    return RetrievedChunk(
        id=chunk_id,
        document_id="document",
        content=content,
        section_path="Section",
        kind="text",
        source="docs/source.md",
        score=0.75,
        metadata={},
    )


def test_retriever_span_carries_bounded_input_and_output(spans):
    tracer, exporter = spans
    with tracer.start_as_current_span("retrieve.rerank") as span:
        tag_retriever(
            span,
            query="question",
            input_docs=[_chunk("input", "x" * 500)],
            output_docs=[_chunk("output")],
        )

    finished = exporter.get_finished_spans()[0]
    attributes = finished.attributes
    assert attributes["langfuse.observation.type"] == "retriever"

    input_payload = json.loads(attributes["langfuse.observation.input"])
    output_payload = json.loads(attributes["langfuse.observation.output"])
    assert input_payload["query"] == "question"
    assert input_payload["documents"][0]["id"] == "input"
    assert input_payload["documents"][0]["content"].endswith("...[truncated]")
    assert output_payload[0]["id"] == "output"


def test_tool_span_records_payload_and_exception_status(spans):
    tracer, exporter = spans
    error = RuntimeError("tool failed")
    with tracer.start_as_current_span("tool.search_docs") as span:
        tag_tool(
            span,
            args={"query": "question"},
            output={"error": "failed"},
            is_error=True,
            exception=error,
        )

    finished = exporter.get_finished_spans()[0]
    assert finished.attributes["langfuse.observation.type"] == "tool"
    assert json.loads(finished.attributes["langfuse.observation.input"]) == {"query": "question"}
    assert finished.status.status_code is StatusCode.ERROR
    assert finished.events[0].name == "exception"
    assert finished.events[0].attributes["exception.type"] == "RuntimeError"


def test_payload_attributes_are_omitted_when_disabled(spans, monkeypatch):
    monkeypatch.setenv("OBSERVE_PAYLOADS", "false")
    get_settings.cache_clear()
    tracer, exporter = spans

    with tracer.start_as_current_span("retrieve.vector") as span:
        tag_retriever(span, query="private question", output_docs=[_chunk("private")])

    attributes = exporter.get_finished_spans()[0].attributes
    assert attributes["langfuse.observation.type"] == "retriever"
    assert "langfuse.observation.input" not in attributes
    assert "langfuse.observation.output" not in attributes


def test_total_payload_truncation_remains_valid_json():
    payload = json.loads(_bounded_json({"items": ["x" * 200] * 100}))

    assert payload["truncated"] is True
    assert len(payload["preview"]) < 8000
