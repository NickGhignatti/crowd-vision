import logging
import sys

import structlog

from app.config import get_settings


class _HealthAccessFilter(logging.Filter):
    """Drop uvicorn access-log lines for the /health heartbeat.

    uvicorn logs access records with args
    ``(client_addr, method, full_path, http_version, status)`` — we match on the
    path so the every-5s Docker healthcheck doesn't flood the console.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3:
            return "/health" not in str(args[2])
        return True


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    # Silence the every-5s /health heartbeat in uvicorn's access log.
    logging.getLogger("uvicorn.access").addFilter(_HealthAccessFilter())

    # Pretty, human-readable console in dev; structured JSON in prod.
    fmt = settings.log_format.lower()
    pretty = fmt == "console" or (fmt == "auto" and not settings.otel_endpoint)
    renderer: structlog.types.Processor = (
        structlog.dev.ConsoleRenderer() if pretty else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key="time"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
