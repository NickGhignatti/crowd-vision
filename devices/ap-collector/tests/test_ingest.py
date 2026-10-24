import email.message
import json
import urllib.error
from pathlib import Path

import pytest

from app.ingest import IngestError, post_observations, sign

_FIXTURE = Path(__file__).resolve().parents[3] / "schemas" / "fixtures" / "internal-signature.json"


def test_sign_matches_every_shared_conformance_case():
    """Same fixture Rust's ingest_auth.rs and Go's verifier assert against -- if this ever
    disagrees with them, a real signed tick would be rejected as unauthenticated."""
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


_URL = "http://telemetry.example/observations"
_TICK = {"buildingId": "b1", "tick": 1, "answered": ["r1"], "connected": [], "bursts": []}


def test_post_observations_signs_the_exact_serialised_bytes(monkeypatch):
    captured = _mock_urlopen(monkeypatch)
    secret = b"x" * 32

    post_observations(_URL, secret, _TICK, timeout=3)

    (request,) = captured
    assert request.full_url == _URL
    assert request.get_method() == "POST"
    assert request.get_header("Content-type") == "application/json"
    raw = request.data
    assert json.loads(raw) == _TICK
    assert request.get_header("X-signature") == sign(secret, raw)


@pytest.mark.parametrize(
    "error",
    [
        urllib.error.HTTPError(_URL, 400, "Bad Request", email.message.Message(), None),
        urllib.error.URLError("connection refused"),
        TimeoutError(),
    ],
    ids=["refused", "unreachable", "timeout"],
)
def test_post_observations_raises_when_the_tick_is_not_accepted(monkeypatch, error):
    _mock_urlopen(monkeypatch, error=error)

    with pytest.raises(IngestError):
        post_observations(_URL, b"x" * 32, _TICK, timeout=3)
