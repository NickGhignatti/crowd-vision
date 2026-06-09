"""API-level test that the /ask route is wired to the model-override gate.

Complements tests/unit/test_model_override.py (which unit-tests the gate function):
this drives the real FastAPI route to prove the handler actually *calls* the gate and
threads the chosen model through to the agent. It's hermetic — `require_user` and
`get_session` are overridden and the agent is stubbed — so it hits no DB and no LLM
(the security-critical 403 fires before either would be touched anyway).
"""

import pytest
from fastapi.testclient import TestClient

from app.agent.loop import AnswerResult, Usage
from app.auth import AuthUser, require_user
from app.config import get_settings
from app.db import get_session
from app.main import app
from app.routes import ask as ask_route


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    # Settings is lru_cached; clear around each test so env tweaks take effect and the
    # default min-role (business_admin) holds for tests that don't set it.
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.delenv("ALLOWED_MODELS", raising=False)
    monkeypatch.delenv("MODEL_OVERRIDE_MIN_ROLE", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def agent_calls(monkeypatch):
    """Stub the agent so the handler never touches the DB or an LLM, and record the
    `llm` it was called with so we can assert the override was wired through."""
    calls: dict = {}

    async def _answer(session, question, user, llm=None, history=None):
        calls["llm"] = llm
        calls["history"] = history
        return AnswerResult(answer="ok", citations=[], retrieved=[], usage=Usage(1, 1, 0.0))

    monkeypatch.setattr(ask_route._agent, "answer", _answer)
    return calls


@pytest.fixture
def client():
    async def _no_session():  # never used: gate / stub agent run before any query
        yield None

    app.dependency_overrides[get_session] = _no_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _login_as(role: str) -> None:
    app.dependency_overrides[require_user] = lambda: AuthUser("u", roles=[role])


def _ask(client: TestClient, **body):
    return client.post("/ask", json={"question": "hi", "stream": False, **body})


def test_standard_customer_cannot_choose_model(client, agent_calls):
    _login_as("standard_customer")
    r = _ask(client, model="openai/gpt-4o")
    assert r.status_code == 403
    assert "business_admin" in r.json()["detail"]
    assert "llm" not in agent_calls  # blocked before the agent runs


def test_business_staff_cannot_choose_model(client, agent_calls):
    _login_as("business_staff")
    assert _ask(client, model="openai/gpt-4o").status_code == 403


def test_standard_customer_without_override_is_allowed(client, agent_calls):
    _login_as("standard_customer")
    r = _ask(client)  # no model field
    assert r.status_code == 200
    assert agent_calls["llm"] is None  # falls back to the server default model


def test_privileged_user_may_choose_model_and_it_is_wired_through(client, agent_calls):
    _login_as("business_admin")
    r = _ask(client, model="openai/gpt-4o-mini")
    assert r.status_code == 200
    assert agent_calls["llm"].model == "openai/gpt-4o-mini"


def test_off_allowlist_model_is_rejected(client, agent_calls, monkeypatch):
    monkeypatch.setenv("ALLOWED_MODELS", "openai/gpt-4o-mini")
    get_settings.cache_clear()
    _login_as("admin")
    r = _ask(client, model="openai/gpt-4o")
    assert r.status_code == 400
    assert "llm" not in agent_calls
