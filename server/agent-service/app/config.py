from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    postgres_url: str = Field(
        default="postgresql+asyncpg://agent:agent@agent-db:5432/agentdb",
        alias="POSTGRES_URL",
    )
    google_api_key: str = Field(default="", alias="GOOGLE_API_KEY")
    deepseek_api_key: str = Field(default="", alias="DEEPSEEK_API_KEY")
    jwt_secret: str = Field(default="", alias="JWT_SECRET")
    jwt_cookie_name: str = Field(default="authentication_token", alias="JWT_COOKIE_NAME")

    embedding_model: str = Field(default="gemini-embedding-001", alias="EMBEDDING_MODEL")
    embedding_dim: int = Field(default=768, alias="EMBEDDING_DIM")
    answer_model: str = Field(default="gemini-2.5-flash", alias="ANSWER_MODEL")
    router_model: str = Field(default="deepseek-chat", alias="ROUTER_MODEL")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", alias="DEEPSEEK_BASE_URL")

    reranker: str = Field(default="noop", alias="RERANKER")
    top_k_vector: int = Field(default=20, alias="TOP_K_VECTOR")
    top_k_keyword: int = Field(default=20, alias="TOP_K_KEYWORD")
    top_k_final: int = Field(default=6, alias="TOP_K_FINAL")
    confidence_threshold: float = Field(default=0.15, alias="CONFIDENCE_THRESHOLD")

    llm_timeout_seconds: float = Field(default=30.0, alias="LLM_TIMEOUT_SECONDS")
    embed_timeout_seconds: float = Field(default=15.0, alias="EMBED_TIMEOUT_SECONDS")

    otel_endpoint: str = Field(default="", alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

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
