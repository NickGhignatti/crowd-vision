import pytest
from pydantic import ValidationError

from app.config import Settings, validate_startup_settings


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("EMBEDDING_DIM", "0"),
        ("TOP_K_VECTOR", "0"),
        ("TOP_K_KEYWORD", "-1"),
        ("TOP_K_FINAL", "0"),
        ("LLM_TIMEOUT_SECONDS", "0"),
        ("EMBED_TIMEOUT_SECONDS", "-1"),
        ("TWIN_TIMEOUT_SECONDS", "0"),
        ("SENSOR_TIMEOUT_SECONDS", "0"),
        ("MAX_OUTPUT_TOKENS", "0"),
        ("MAX_TOOL_HOPS", "0"),
        ("LLM_TEMPERATURE", "2.1"),
    ],
)
def test_invalid_numeric_settings_are_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("MODEL_OVERRIDE_MIN_ROLE", "business-admn"),
        ("LOG_FORMAT", "jsno"),
        ("LLM_BASE_URL", "openrouter.ai/api/v1"),
        ("TWIN_SERVICE_URL", "twin-service:3000"),
        ("SENSOR_SERVICE_URL", "sensor-service:3000"),
        ("POSTGRES_URL", "mysql://agent-db/agentdb"),
    ],
)
def test_invalid_closed_or_url_settings_are_rejected(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        Settings()


def test_settings_construction_does_not_require_runtime_secrets(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    settings = Settings()
    assert settings.jwt_secret == ""
    assert settings.llm_api_key == ""
    assert settings.observe_payloads is False


def test_startup_rejects_missing_runtime_secrets(monkeypatch):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match=r"JWT_SECRET.*OPENROUTER_API_KEY"):
        validate_startup_settings(Settings())


def test_startup_allows_auth_disabled_without_jwt_secret(monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "false")
    monkeypatch.setenv("LLM_API_KEY", "test-key")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    validate_startup_settings(Settings())
