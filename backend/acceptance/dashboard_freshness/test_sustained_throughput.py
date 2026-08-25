"""
LD-4 — live dashboard freshness under sustained load. Baseline for issue #340.

The sibling test_performance.py measures p99 over 100 one-shot round trips at
20-way concurrency. That is a latency figure and says nothing about
throughput: how many readings a second the ingestion path sustains, and
whether any are lost on the way to a dashboard once they start queueing.

This test drives a fixed offered rate for a fixed duration against one
building's rooms, then reports the achieved accept rate, the ingest-latency
p99, and the delivered/sent ratio.

What is asserted is loss, not speed. A rate floor would bake whichever
machine runs CI into the assertion and start failing for reasons that have
nothing to do with the code. The measured numbers are printed instead — the
suite runs pytest with `-s` — and belong in the issue, where a later change
can be compared against them.

Measurement note: the latency recorded per request is the POST round trip to
`/ingest` (accepted, i.e. persisted and fanned out), not ingestion-to-
dashboard. The end-to-end figure is test_performance.py's job; separating
them is deliberate, since under sustained load an end-to-end sample would
mostly measure the test's own receive queue.
"""

import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from support import telemetry
from support.claims import claims_header
from support.config import SOCKET_URL
from support.dashboard_socket import DashboardSocket
from support.percentiles import MIN_SAMPLES_FOR_P99, p99

TARGET_RATE_HZ = 50
DURATION_SECONDS = 12
TOTAL_READINGS = TARGET_RATE_HZ * DURATION_SECONDS
ROOMS = 10
# Enough threads that the pacer, not the pool, is what limits the offered
# rate: at 50Hz this only saturates if a single POST takes over 400ms.
WORKERS = 20
DRAIN_IDLE_SECONDS = 5.0

assert TOTAL_READINGS >= MIN_SAMPLES_FOR_P99


def _paced_ingest(
    client: httpx.Client,
    building_id: str,
    room_ids: list[str],
    start: float,
    index: int,
) -> tuple[int, float]:
    """Post reading `index` at its scheduled slot, returning (status, seconds)."""
    scheduled = start + index / TARGET_RATE_HZ
    delay = scheduled - time.monotonic()
    if delay > 0:
        time.sleep(delay)

    sent_at = time.monotonic()
    response = telemetry.ingest_temperature(
        client,
        building_id,
        room_ids[index % ROOMS],
        value=float(20 + index % 5),
    )
    return response.status_code, time.monotonic() - sent_at


def test_sustained_ingest_is_accepted_and_delivered_without_loss():
    building_id, _ = telemetry.new_room()
    room_ids = [telemetry.new_room(building_id=building_id)[1] for _ in range(ROOMS)]

    with httpx.Client(timeout=30.0) as client:
        telemetry.register_dashboard_preference(client, building_id)

        dashboard = DashboardSocket(building_id)
        dashboard.connect(SOCKET_URL, headers={"x-gateway-claims": claims_header()})
        try:
            start = time.monotonic()
            with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                results = list(
                    pool.map(
                        lambda index: _paced_ingest(client, building_id, room_ids, start, index),
                        range(TOTAL_READINGS),
                    )
                )
            elapsed = time.monotonic() - start
            delivered = dashboard.drain_telemetry(idle_timeout=DRAIN_IDLE_SECONDS)
        finally:
            dashboard.disconnect()

    statuses = [status for status, _ in results]
    latencies = [seconds for _, seconds in results]
    accepted = sum(1 for status in statuses if status == 202)

    print(
        f"\n[#340 baseline] offered {TARGET_RATE_HZ}/s over {TOTAL_READINGS} readings"
        f"\n[#340 baseline] achieved accept rate: {accepted / elapsed:.1f}/s ({elapsed:.1f}s)"
        f"\n[#340 baseline] ingest latency p99:   {p99(latencies) * 1000:.0f}ms"
        f"\n[#340 baseline] ingest latency mean:  {sum(latencies) / len(latencies) * 1000:.0f}ms"
        f"\n[#340 baseline] delivered/sent:       {delivered}/{accepted}"
    )

    rejected = sorted({status for status in statuses if status != 202})
    assert accepted == TOTAL_READINGS, (
        f"{TOTAL_READINGS - accepted} of {TOTAL_READINGS} readings were not accepted "
        f"at {TARGET_RATE_HZ}/s (statuses seen: {rejected})"
    )
    assert delivered == accepted, (
        f"{accepted - delivered} of {accepted} accepted readings never reached the "
        f"dashboard at {TARGET_RATE_HZ}/s — the pipeline drops telemetry under load"
    )
