import os


def _env(name: str, default: str) -> str:
    return os.environ.get(name, default)


# Defaults match this suite's own docker-compose.integration.yml (compose
# service-name DNS, internal port 3000 every one of these services listens
# on) — the primary supported way to run this suite is `just test integration`,
# which sets these explicitly anyway.
TELEMETRY_SERVICE_URL = _env("TELEMETRY_SERVICE_URL", "http://telemetry-service:3000")
SOCKET_SERVICE_URL = _env("SOCKET_SERVICE_URL", "http://socket-server:3000")
CONTRACTS_SERVICE_URL = _env("CONTRACTS_SERVICE_URL", "http://contracts-service:3000")
TELEMETRY_INGEST_SECRET = _env("TELEMETRY_INGEST_SECRET", "integration-ingest-secret-0123456789")
