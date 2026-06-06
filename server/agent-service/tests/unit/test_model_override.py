"""The /ask `model` override is a privileged eval/ops feature (it spends the shared
OpenRouter balance), so it must be gated by role and an optional allowlist."""

import pytest
from fastapi import HTTPException

from app.auth import AuthUser
from app.config import get_settings
from app.routes.ask import _resolve_override_llm


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    # Settings is lru_cached; clear around each test so env tweaks take effect.
    monkeypatch.delenv("ALLOWED_MODELS", raising=False)
    monkeypatch.delenv("MODEL_OVERRIDE_MIN_ROLE", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_no_override_returns_none():
    assert _resolve_override_llm(None, AuthUser("u", roles=["standard_customer"])) is None


def test_low_role_is_forbidden():
    with pytest.raises(HTTPException) as e:
        _resolve_override_llm("openai/gpt-4o", AuthUser("u", roles=["standard_customer"]))
    assert e.value.status_code == 403


def test_no_roles_is_forbidden():
    with pytest.raises(HTTPException) as e:
        _resolve_override_llm("openai/gpt-4o", AuthUser("u"))
    assert e.value.status_code == 403


def test_privileged_role_allowed_when_no_allowlist():
    llm = _resolve_override_llm("openai/gpt-4o", AuthUser("u", roles=["business_admin"]))
    assert llm is not None
    assert llm.model == "openai/gpt-4o"


def test_off_allowlist_is_rejected(monkeypatch):
    monkeypatch.setenv("ALLOWED_MODELS", "openai/gpt-4o-mini,google/gemini-2.5-flash")
    get_settings.cache_clear()
    with pytest.raises(HTTPException) as e:
        _resolve_override_llm("openai/gpt-4o", AuthUser("u", roles=["admin"]))
    assert e.value.status_code == 400


def test_allowlisted_model_passes(monkeypatch):
    monkeypatch.setenv("ALLOWED_MODELS", "openai/gpt-4o-mini,google/gemini-2.5-flash")
    get_settings.cache_clear()
    llm = _resolve_override_llm("google/gemini-2.5-flash", AuthUser("u", roles=["admin"]))
    assert llm is not None and llm.model == "google/gemini-2.5-flash"
