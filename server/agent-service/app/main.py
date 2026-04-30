from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.config import get_settings
from app.db import dispose_engine, get_engine
from app.logging import configure_logging, get_logger
from app.routes import ask, health, ingest
from app.tracing import configure_tracing


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


app = FastAPI(title="agent-service", lifespan=lifespan)

_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
_allow_all = _origins == ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all else _origins,
    allow_origin_regex=None,
    allow_credentials=not _allow_all,
    allow_methods=["*"],
    allow_headers=["*"],
)

FastAPIInstrumentor.instrument_app(app)

app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(ask.router)
