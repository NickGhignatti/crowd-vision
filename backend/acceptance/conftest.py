import pytest

from support.config import DASHBOARD_URL
from support.http_client import wait_until_ready


@pytest.fixture(scope="session", autouse=True)
def _services_ready() -> None:
    """dashboard has no docker-compose healthcheck (only
    `condition: service_started`), unlike telemetry/socket —
    so unlike those, every acceptance test needs a real readiness poll
    before touching it, once per session. /health is the only
    unauthenticated route dashboard exposes (its catalog endpoint
    is `/`, and it requires a claims header — see contracts_catalog tests).
    """
    wait_until_ready(f"{DASHBOARD_URL}/health")
