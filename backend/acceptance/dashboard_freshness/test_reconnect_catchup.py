"""
LD-4 — live dashboard freshness (part 2 of 2 functional scenarios)

Given the live update connection is lost, when a reading is ingested during
the outage, then the dashboard reflects it once connectivity is restored
rather than staying silently stale, and never shows the pre-outage value as
current while disconnected.

Backend-provable half only: proves the *value is available* once the
dashboard looks again after reconnecting — a REST re-fetch, the same
recovery path frontend/src/stores/sensorData.ts's `on('connect', ...)`
handler uses. Does NOT prove the dashboard's UI actually re-renders on
reconnect — that's client-side code, implemented in sensorData.ts but
missing from the older frontend/src/composables/building/useSensorData.ts
path (checked directly: it has no reconnect listener at all). Proving the
UI itself needs a real-browser (Playwright) e2e test — out of scope here.
"""

import httpx

from support import telemetry
from support.claims import claims_header
from support.config import SOCKET_URL
from support.dashboard_socket import DashboardSocket


def test_reading_ingested_during_an_outage_is_available_after_reconnecting():
    building_id, room_id = telemetry.new_room()
    headers = {"x-gateway-claims": claims_header()}

    with httpx.Client(timeout=10.0) as client:
        telemetry.register_dashboard_preference(client, building_id)

        dashboard = DashboardSocket(building_id)
        dashboard.connect(SOCKET_URL, headers=headers)

        # A known pre-outage value, so the post-reconnect assertion below
        # proves the NEW reading won, never a stale leftover.
        pre_outage = telemetry.ingest_temperature(client, building_id, room_id, value=20.0)
        assert pre_outage.status_code == 202
        dashboard.wait_for_telemetry(timeout=10.0)

        dashboard.disconnect()

        during_outage = telemetry.ingest_temperature(client, building_id, room_id, value=30.0)
        assert during_outage.status_code == 202

        dashboard.connect(SOCKET_URL, headers=headers)
        try:
            latest = telemetry.latest_temperature(client, building_id, room_id)
            assert latest["temperature"] == 30.0, (
                "dashboard must reflect the reading ingested during the outage, "
                "not the pre-outage value, once connectivity is restored"
            )
        finally:
            dashboard.disconnect()
