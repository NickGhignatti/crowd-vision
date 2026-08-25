import time

import httpx


def wait_until_ready(url: str, retries: int = 20, delay_seconds: float = 2.0) -> None:
    """Poll a URL until it answers 2xx. Most services in this stack are
    gated by a real docker-compose healthcheck before this suite's container
    even starts — dashboard is the one exception (only
    `condition: service_started`, no healthcheck), so anything touching it
    needs this guard first.
    """
    last_error: Exception | None = None
    for _ in range(retries):
        try:
            response = httpx.get(url, timeout=5.0)
            if response.status_code // 100 == 2:
                return
        except httpx.HTTPError as error:
            last_error = error
        time.sleep(delay_seconds)
    raise RuntimeError(f"{url} not reachable after {retries} attempts") from last_error
