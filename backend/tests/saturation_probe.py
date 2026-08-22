import statistics, sys, time
from concurrent.futures import ThreadPoolExecutor
import httpx
from support import telemetry

DURATION = 8.0

def run(concurrency: int) -> tuple[float, float, int]:
    building_id, room_id = telemetry.new_room()
    latencies, errors, deadline = [], 0, time.monotonic() + DURATION
    with httpx.Client(timeout=30.0, limits=httpx.Limits(max_connections=concurrency * 2)) as client:
        def worker() -> None:
            nonlocal errors
            while time.monotonic() < deadline:
                t0 = time.monotonic()
                try:
                    r = telemetry.ingest_temperature(client, building_id, room_id, 21.0)
                    if r.status_code != 202:
                        errors += 1
                except Exception:
                    errors += 1
                latencies.append(time.monotonic() - t0)
        start = time.monotonic()
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            list(pool.map(lambda _: worker(), range(concurrency)))
        elapsed = time.monotonic() - start
    return len(latencies) / elapsed, statistics.quantiles(latencies, n=100)[98], errors

for c in [1, 4, 16, 64, 128]:
    rate, p99, errors = run(c)
    print(f"concurrency {c:>4}: {rate:8.1f} req/s   p99 {p99*1000:6.1f}ms   errors {errors}", flush=True)
