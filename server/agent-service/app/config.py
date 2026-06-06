from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.roles import ROLE_WEIGHTS

LogFormat = Literal["auto", "console", "json"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    # Database
    postgres_url: str = Field(
        default="postgresql+asyncpg://agent:agent@agent-db:5432/agentdb",
        alias="POSTGRES_URL",
    )

    # LLM provider (any OpenAI-compatible endpoint: OpenRouter, OpenAI, etc.)
    # A single key/base-url drives both chat and embeddings. The legacy
    # GOOGLE_API_KEY / DEEPSEEK_API_KEY names are accepted as fallbacks so existing
    # deployments keep working without an env rename.
    llm_api_key: str = Field(
        default="",
        validation_alias=AliasChoices(
            "OPENROUTER_API_KEY", "LLM_API_KEY", "DEEPSEEK_API_KEY", "GOOGLE_API_KEY"
        ),
    )
    llm_base_url: str = Field(
        default="https://openrouter.ai/api/v1",
        validation_alias=AliasChoices("LLM_BASE_URL", "OPENROUTER_BASE_URL"),
    )

    # Authentication
    jwt_secret: str = Field(default="", alias="JWT_SECRET")
    jwt_cookie_name: str = Field(default="authentication_token", alias="JWT_COOKIE_NAME")
    require_auth: bool = Field(default=True, alias="REQUIRE_AUTH")

    # Models
    embedding_model: str = Field(default="openai/text-embedding-3-small", alias="EMBEDDING_MODEL")
    embedding_dim: int = Field(default=768, alias="EMBEDDING_DIM", gt=0)
    answer_model: str = Field(
        default="openai/gpt-4o-mini",
        validation_alias=AliasChoices("ANSWER_MODEL", "CHAT_MODEL"),
    )
    llm_temperature: float = Field(default=0.2, alias="LLM_TEMPERATURE", ge=0, le=2)

    # Retrieval
    reranker: str = Field(default="noop", alias="RERANKER")
    top_k_vector: int = Field(default=20, alias="TOP_K_VECTOR", gt=0)
    top_k_keyword: int = Field(default=20, alias="TOP_K_KEYWORD", gt=0)
    top_k_final: int = Field(default=6, alias="TOP_K_FINAL", gt=0)

    # Agent execution
    llm_timeout_seconds: float = Field(default=30.0, alias="LLM_TIMEOUT_SECONDS", gt=0)
    embed_timeout_seconds: float = Field(default=15.0, alias="EMBED_TIMEOUT_SECONDS", gt=0)
    twin_timeout_seconds: float = Field(default=10.0, alias="TWIN_TIMEOUT_SECONDS", gt=0)
    max_tool_hops: int = Field(default=6, alias="MAX_TOOL_HOPS", ge=1)
    # Cap on generated tokens per LLM call. Besides bounding cost, sending an
    # explicit max_tokens keeps OpenRouter's credit/affordability pre-check happy:
    # models that advertise a huge default max output (e.g. Gemini's 65k) otherwise
    # get a 402 "requires more credits" on low-balance accounts.
    max_output_tokens: int = Field(default=2048, alias="MAX_OUTPUT_TOKENS", gt=0)

    # Per-request chat-model override (`/ask` `model` field) is a privileged eval/ops
    # feature, not for end users — it spends the shared OpenRouter balance. It is
    # honoured only for callers at/above this role, and (when set) the model must be
    # in the allowlist. Empty allowlist ⇒ no allowlist constraint (still role-gated).
    model_override_min_role: str = Field(default="business_admin", alias="MODEL_OVERRIDE_MIN_ROLE")
    allowed_models: str = Field(default="", alias="ALLOWED_MODELS")

    @property
    def allowed_models_set(self) -> set[str]:
        return {m.strip() for m in self.allowed_models.split(",") if m.strip()}

    # Observability
    otel_endpoint: str = Field(default="", alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    # "http/protobuf" routes traces to an OTLP/HTTP collector (e.g. Langfuse at
    # /api/public/otel); anything else (default) uses the OTLP/gRPC exporter.
    # Endpoint + auth headers are read from the standard OTEL_EXPORTER_OTLP_* env
    # vars by the exporter itself.
    otel_protocol: str = Field(default="", alias="OTEL_EXPORTER_OTLP_PROTOCOL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    # auto = pretty console when no OTLP endpoint (dev), JSON otherwise (prod).
    # Force with "console" or "json".
    log_format: LogFormat = Field(default="auto", alias="LOG_FORMAT")

    # Networking
    twin_service_url: str = Field(default="http://twin-service:3000", alias="TWIN_SERVICE_URL")
    cors_origins: str = Field(
        default="http://localhost,http://localhost:80,http://localhost:8080,http://localhost:5173",
        alias="CORS_ORIGINS",
    )

    @field_validator("llm_base_url", "twin_service_url")
    @classmethod
    def validate_http_url(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            raise ValueError("must start with http:// or https://")
        return value

    @field_validator("postgres_url")
    @classmethod
    def validate_postgres_url(cls, value: str) -> str:
        if not value.startswith(("postgresql://", "postgresql+asyncpg://")):
            raise ValueError("must start with postgresql:// or postgresql+asyncpg://")
        return value

    @field_validator("model_override_min_role")
    @classmethod
    def validate_model_override_min_role(cls, value: str) -> str:
        if value not in ROLE_WEIGHTS:
            allowed = ", ".join(ROLE_WEIGHTS)
            raise ValueError(f"must be one of: {allowed}")
        return value


def validate_startup_settings(settings: Settings) -> None:
    """Reject missing runtime secrets without making Settings construction stateful."""
    missing: list[str] = []
    if settings.require_auth and not settings.jwt_secret:
        missing.append("JWT_SECRET (required when REQUIRE_AUTH=true)")
    if not settings.llm_api_key:
        missing.append("OPENROUTER_API_KEY or LLM_API_KEY")
    if missing:
        raise RuntimeError(f"missing required agent-service configuration: {', '.join(missing)}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
