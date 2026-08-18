import pytest

from support.config import CONTRACTS_SERVICE_URL
from support.http_client import wait_until_ready


@pytest.fixture(scope="session", autouse=True)
def _services_ready() -> None:
    """contracts-service has no docker-compose healthcheck (only
    `condition: service_started`), unlike telemetry-service/socket-server —
    so unlike those, every acceptance test needs a real readiness poll
    before touching it, once per session. /health is the only
    unauthenticated route contracts-service exposes (its catalog endpoint
    is `/`, and it requires a claims header — see contracts_catalog tests).
    """
    wait_until_ready(f"{CONTRACTS_SERVICE_URL}/health")
