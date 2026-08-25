"""
LD-4 — live dashboard freshness (performance). Target owned by QA-P-01.

Given the ingestion-to-dashboard path under normal load, when a reading is
ingested, then the 99th percentile of the time from ingestion-accepted to
the update leaving socket is at most 1 second, and the 99th
percentile end-to-end to the value being rendered is at most 5 seconds.

Measurement note: socket has no server-side timing or
correlation-id instrumentation on this path today (checked
handlers/telemetry.ts and config/registry.ts — only a bare relay counter
exists; it never reads the `ingestedAt` field telemetry already stamps
onto every event). Both checkpoints below are therefore measured the same
way: wall-clock time between this test's own ingest call returning 202 and
its own socket client receiving the `telemetry` event. That's a reasonable
proxy for "leaves socket" (the test client is the very next hop)
and a safe superset of "rendered" (Vue's re-render + paint after a socket
event is single-digit milliseconds against a 5-second budget) — but it is
not a true production instrumentation measurement. Add real timing in
socket if this ever needs to be tighter than this test can prove.
"""

import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from support import telemetry
from support.claims import claims_header
from support.config import SOCKET_URL
from support.dashboard_socket import DashboardSocket
from support.percentiles import p99

SAMPLE_SIZE = 100  # below this, p99 is just the max — see support/percentiles.py


def _one_round_trip(index: int) -> float:
    building_id, room_id = telemetry.new_room()
    headers = {"x-gateway-claims": claims_header()}

    with httpx.Client(timeout=10.0) as client:
        telemetry.register_dashboard_preference(client, building_id)

        dashboard = DashboardSocket(building_id)
        dashboard.connect(SOCKET_URL, headers=headers)
        try:
            start = time.monotonic()
            response = telemetry.ingest_temperature(client, building_id, room_id, value=float(index))
            assert response.status_code == 202

            dashboard.wait_for_telemetry(timeout=10.0)
            return time.monotonic() - start
        finally:
            dashboard.disconnect()


def test_ingestion_to_dashboard_p99_meets_both_sla_checkpoints():
    with ThreadPoolExecutor(max_workers=20) as pool:
        latencies = list(pool.map(_one_round_trip, range(SAMPLE_SIZE)))

    observed = p99(latencies)

    # Printed, not just asserted: the budget below says whether we are inside
    # the SLA, never how much room is left. Issue #340 needs the number itself
    # to tell an improvement from a no-op.
    print(
        f"\n[#340 baseline] ingestion-to-dashboard p99:  {observed * 1000:.0f}ms"
        f"\n[#340 baseline] ingestion-to-dashboard mean: "
        f"{sum(latencies) / len(latencies) * 1000:.0f}ms"
    )

    assert observed <= 1.0, (
        f"p99 ingestion-to-leaving-socket latency {observed:.3f}s exceeded 1s"
    )
    assert observed <= 5.0, (
        f"p99 end-to-end-to-rendered latency {observed:.3f}s exceeded 5s"
    )
