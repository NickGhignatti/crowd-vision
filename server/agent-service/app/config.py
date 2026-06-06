from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    postgres_url: str = Field(
        default="postgresql+asyncpg://agent:agent@agent-db:5432/agentdb",
        alias="POSTGRES_URL",
    )

    # ── LLM provider (any OpenAI-compatible endpoint: OpenRouter, OpenAI, etc.) ──
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

    jwt_secret: str = Field(default="", alias="JWT_SECRET")
    jwt_cookie_name: str = Field(default="authentication_token", alias="JWT_COOKIE_NAME")

    embedding_model: str = Field(default="openai/text-embedding-3-small", alias="EMBEDDING_MODEL")
    embedding_dim: int = Field(default=768, alias="EMBEDDING_DIM")
    answer_model: str = Field(
        default="openai/gpt-4o-mini",
        validation_alias=AliasChoices("ANSWER_MODEL", "CHAT_MODEL"),
    )

    reranker: str = Field(default="noop", alias="RERANKER")
    top_k_vector: int = Field(default=20, alias="TOP_K_VECTOR")
    top_k_keyword: int = Field(default=20, alias="TOP_K_KEYWORD")
    top_k_final: int = Field(default=6, alias="TOP_K_FINAL")
    confidence_threshold: float = Field(default=0.15, alias="CONFIDENCE_THRESHOLD")

    llm_timeout_seconds: float = Field(default=30.0, alias="LLM_TIMEOUT_SECONDS")
    # Cap on generated tokens per LLM call. Besides bounding cost, sending an
    # explicit max_tokens keeps OpenRouter's credit/affordability pre-check happy:
    # models that advertise a huge default max output (e.g. Gemini's 65k) otherwise
    # get a 402 "requires more credits" on low-balance accounts.
    max_output_tokens: int = Field(default=2048, alias="MAX_OUTPUT_TOKENS")
    embed_timeout_seconds: float = Field(default=15.0, alias="EMBED_TIMEOUT_SECONDS")

    otel_endpoint: str = Field(default="", alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    # "http/protobuf" routes traces to an OTLP/HTTP collector (e.g. Langfuse at
    # /api/public/otel); anything else (default) uses the OTLP/gRPC exporter.
    # Endpoint + auth headers are read from the standard OTEL_EXPORTER_OTLP_* env
    # vars by the exporter itself.
    otel_protocol: str = Field(default="", alias="OTEL_EXPORTER_OTLP_PROTOCOL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    # auto = pretty console when no OTLP endpoint (dev), JSON otherwise (prod).
    # Force with "console" or "json".
    log_format: str = Field(default="auto", alias="LOG_FORMAT")

    require_auth: bool = Field(default=True, alias="REQUIRE_AUTH")
    twin_service_url: str = Field(default="http://twin-service:3000", alias="TWIN_SERVICE_URL")
    max_tool_hops: int = Field(default=6, alias="MAX_TOOL_HOPS")
    cors_origins: str = Field(
        default="http://localhost,http://localhost:80,http://localhost:8080,http://localhost:5173",
        alias="CORS_ORIGINS",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
