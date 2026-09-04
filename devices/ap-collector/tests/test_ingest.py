import json
import urllib.error
from pathlib import Path

import pytest

from app.ingest import MAX_BATCH_READINGS, IngestError, post_batch, sign

_FIXTURE = Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "internal-signature.json"


def test_sign_matches_every_shared_conformance_case():
    """Same fixture Rust's ingest_auth.rs and Go's verifier assert against -- if this ever
    disagrees with them, a real signed batch would be rejected as unauthenticated."""
    fixture = json.loads(_FIXTURE.read_text())
    secret = fixture["secret"].encode("utf-8")

    for case in fixture["cases"]:
        raw = case["body"].encode("utf-8")
        assert sign(secret, raw) == case["signature"], case["name"]


class _FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _mock_urlopen(monkeypatch, *, error: Exception | None = None):
    captured = []

    def fake(request, timeout=None):
        captured.append(request)
        if error is not None:
            raise error
        return _FakeResponse()

    monkeypatch.setattr("urllib.request.urlopen", fake)
    return captured


def test_post_batch_signs_the_exact_serialised_bytes(monkeypatch):
    captured = _mock_urlopen(monkeypatch)
    secret = b"x" * 32
    readings = [{"type": "deviceDetection", "roomId": "lobby", "timestamp": 1, "deviceCount": 2}]

    post_batch("http://telemetry.example/ingest", secret, "b1", readings, timeout=3)

    request = captured[0]
    assert request.get_method() == "POST"
    assert request.get_header("Content-type") == "application/json"
    raw = request.data
    assert json.loads(raw) == {"buildingId": "b1", "readings": readings}
    assert request.get_header("X-signature") == sign(secret, raw)


def test_post_batch_chunks_at_max_batch_readings(monkeypatch):
    captured = _mock_urlopen(monkeypatch)
    secret = b"x" * 32
    readings = [
        {"type": "deviceDetection", "roomId": f"r{i}", "timestamp": i, "deviceCount": 1}
        for i in range(MAX_BATCH_READINGS + 1)
    ]

    post_batch("http://telemetry.example/ingest", secret, "b1", readings, timeout=3)

    assert len(captured) == 2
    first_body = json.loads(captured[0].data)
    second_body = json.loads(captured[1].data)
    assert len(first_body["readings"]) == MAX_BATCH_READINGS
    assert len(second_body["readings"]) == 1
    assert first_body["readings"] + second_body["readings"] == readings


def test_post_batch_small_batch_is_a_single_request(monkeypatch):
    captured = _mock_urlopen(monkeypatch)

    post_batch("http://telemetry.example/ingest", b"x" * 32, "b1", [{"roomId": "lobby"}], timeout=3)

    assert len(captured) == 1


def test_post_batch_raises_on_http_error(monkeypatch):
    error = urllib.error.HTTPError(
        "http://telemetry.example/ingest", 422, "Unprocessable", {}, None
    )
    _mock_urlopen(monkeypatch, error=error)

    with pytest.raises(IngestError):
        post_batch(
            "http://telemetry.example/ingest", b"x" * 32, "b1", [{"roomId": "lobby"}], timeout=3
        )


def test_post_batch_raises_on_transport_failure(monkeypatch):
    _mock_urlopen(monkeypatch, error=urllib.error.URLError("connection refused"))

    with pytest.raises(IngestError):
        post_batch(
            "http://telemetry.example/ingest", b"x" * 32, "b1", [{"roomId": "lobby"}], timeout=3
        )


def test_post_batch_raises_on_timeout(monkeypatch):
    _mock_urlopen(monkeypatch, error=TimeoutError())

    with pytest.raises(IngestError):
        post_batch(
            "http://telemetry.example/ingest", b"x" * 32, "b1", [{"roomId": "lobby"}], timeout=3
        )
