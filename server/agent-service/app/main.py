from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.config import get_settings
from app.db import dispose_engine, get_engine
from app.logging import configure_logging, get_logger
from app.routes import ask, health, ingest
from app.tracing import configure_tracing

API_VERSION = "2.10.2"

API_DESCRIPTION = """
Tool-calling RAG agent for Crowd-Vision.

The agent answers questions by orchestrating tools — `search_docs` (hybrid
retrieval over ingested documentation) and the `twin-*` tools (live data from
the digital-twin service). Answers come back with inline `[^chunk_id]` citation
markers that resolve to the `citations` array in the response.

**Authentication.** Protected endpoints require a JWT in the `authentication_token`
cookie (issued by `auth-service`). `/health` is public.
""".strip()

OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness and dependency checks."},
    {
        "name": "ingest",
        "description": "Add documents to the knowledge base. Admin-only — content "
        "is chunked, embedded, and stored in pgvector + tsvector.",
    },
    {
        "name": "ask",
        "description": "Ask the agent a question. Supports SSE streaming and a "
        "JSON one-shot response.",
    },
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    configure_tracing()
    get_settings()
    get_engine()
    get_logger(__name__).info("agent_service.startup")
    try:
        yield
    finally:
        await dispose_engine()


app = FastAPI(
    title="agent-service",
    summary="RAG-based Q&A agent for Crowd-Vision.",
    description=API_DESCRIPTION,
    version=API_VERSION,
    openapi_tags=OPENAPI_TAGS,
    contact={"name": "Crowd-Vision", "url": "https://github.com/Mounir-Samite/crowd-vision"},
    license_info={"name": "MIT"},
    lifespan=lifespan,
)


def _custom_openapi() -> dict:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        summary=app.summary,
        description=app.description,
        tags=app.openapi_tags,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["cookieAuth"] = {
        "type": "apiKey",
        "in": "cookie",
        "name": get_settings().jwt_cookie_name,
        "description": "JWT issued by auth-service, set as an HttpOnly cookie.",
    }
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi  # type: ignore[method-assign]

_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
_allow_all = _origins == ["*"]

# Skip the /health heartbeat so it doesn't generate a span on every check.
FastAPIInstrumentor.instrument_app(app, excluded_urls="health")

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(ask.router)
