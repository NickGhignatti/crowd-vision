"""API-level test that POST /ingest is gated to admins only.

Mirrors test_ask_model_gate_api.py's approach: `require_user` and `get_session`
are overridden and `ingest_document` is stubbed, so this is hermetic (no DB) and
proves the handler actually calls the Cedar gate before doing any real work.
"""

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthUser, require_user
from app.config import get_settings
from app.db import get_session
from app.main import app
from app.routes import ingest as ingest_route


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    monkeypatch.setenv("GATEWAY_JWKS_URI", "http://gateway.test/.well-known/jwks.json")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def ingest_calls(monkeypatch):
    calls: dict = {}

    async def _ingest_document(session, embedder, source, content, metadata, permissions):
        calls["source"] = source
        return ("doc-1", 3, False)

    monkeypatch.setattr(ingest_route, "ingest_document", _ingest_document)
    return calls


@pytest.fixture
def client():
    async def _no_session():  # never used: gate fires before any query
        yield None

    app.dependency_overrides[get_session] = _no_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _login_as(*roles: str) -> None:
    app.dependency_overrides[require_user] = lambda: AuthUser("u", roles=list(roles))


def _ingest(client: TestClient, **body):
    return client.post(
        "/ingest",
        json={"source": "docs/example.md", "content": "# Example", **body},
    )


def test_admin_can_ingest(client, ingest_calls):
    _login_as("admin")
    r = _ingest(client)
    assert r.status_code == 200
    assert ingest_calls["source"] == "docs/example.md"


def test_business_admin_cannot_ingest(client, ingest_calls):
    _login_as("business_admin")
    r = _ingest(client)
    assert r.status_code == 403
    assert "admin" in r.json()["detail"]
    assert "source" not in ingest_calls  # blocked before ingestion runs


def test_standard_customer_cannot_ingest(client, ingest_calls):
    _login_as("standard_customer")
    assert _ingest(client).status_code == 403


def test_no_roles_cannot_ingest(client, ingest_calls):
    _login_as()  # authenticated, but no roles at all
    assert _ingest(client).status_code == 403
