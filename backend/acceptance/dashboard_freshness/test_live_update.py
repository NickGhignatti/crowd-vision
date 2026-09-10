"""
LD-4 — live dashboard freshness (part 1 of 2 functional scenarios)

Given a room shown on an open dashboard, when a new reading is ingested for
it, then the value updates on screen without a manual refresh.

Proves the wire-level claim: an ingested reading reaches an open dashboard
connection. Doesn't drive an actual browser DOM — the render step itself is
client-side Vue reactivity, not a backend concern.
"""

import httpx

from support import telemetry
from support.claims import claims_header
from support.config import SOCKET_URL
from support.dashboard_socket import DashboardSocket


def test_ingested_reading_reaches_an_open_dashboard_without_a_refresh():
    building_id, room_id = telemetry.new_room()

    with httpx.Client(timeout=10.0) as client:
        telemetry.register_dashboard_preference(client, building_id)

        dashboard = DashboardSocket(building_id)
        dashboard.connect(SOCKET_URL, headers={"x-gateway-claims": claims_header()})
        try:
            response = telemetry.ingest_temperature(client, building_id, room_id, value=21.5)
            assert response.status_code == 202

            tick = dashboard.wait_for_tick(timeout=10.0)
            assert tick["buildingId"] == building_id
            (reading,) = tick["readings"]
            assert reading["roomId"] == room_id
            assert reading["value"] == 21.5
        finally:
            dashboard.disconnect()
