"""The ap-collector's wire contract against a real telemetry: Python producer, Rust
consumer, nothing compiling them together. Both unit suites once passed while disagreeing.
"""

import math
import time

import httpx
import pytest

from support import telemetry
from support.claims import claims_header
from support.config import TELEMETRY_URL

DEVICES_PER_PERSON = 2.5
OBSERVATIONS_URL = f"{TELEMETRY_URL}/observations"
STAFF = {"x-gateway-claims": claims_header(role="business_staff")}


def collector_tick(building_id: str, rows: list[tuple[str, str, int]], answered: list[str]) -> dict:
    """One tick, shaped like `observations.observations_batch`.

    Written out, not imported: importing it would assert the producer agrees with itself.
    """
    return {
        "buildingId": building_id,
        "tick": int(time.time() * 1000),
        "answered": answered,
        "connected": [
            {"token": token, "router": router, "signal": signal} for token, router, signal in rows
        ],
        "bursts": [],
        "devicesPerPerson": DEVICES_PER_PERSON,
    }


@pytest.fixture(scope="module")
def routers() -> tuple[str, dict[str, str]]:
    """A building with one router per room, as the collector reads it from telemetry."""
    building_id, _ = telemetry.new_room()
    rooms = ["ground-floor", "first-floor", "atrium"]
    with httpx.Client(timeout=10.0) as client:
        client.put(
            f"{TELEMETRY_URL}/thresholds/buildings/{building_id}",
            headers=STAFF,
            json={"name": "Acceptance HQ", "rooms": [{"id": r, "name": r} for r in rooms]},
        ).raise_for_status()
        created = client.post(
            f"{TELEMETRY_URL}/sensors/buildings/{building_id}",
            headers=STAFF,
            json={
                "create": [
                    {"ref": r, "name": f"AP {r}", "sensorType": "router", "roomId": r}
                    for r in rooms
                ]
            },
        )
        created.raise_for_status()
    return building_id, {c["ref"]: c["sensorId"] for c in created.json()["created"]}


def test_a_tick_is_counted_per_room(routers: tuple[str, dict[str, str]]):
    """Reads back per room: proof the counts reached Postgres, not just that the tick was accepted."""
    building_id, by_room = routers
    ground, first, atrium = by_room["ground-floor"], by_room["first-floor"], by_room["atrium"]
    rows = [(f"{n:016x}", ground, -60) for n in range(3)]
    rows += [(f"{n:016x}", first, -60) for n in range(3, 9)]
    # Heard by two routers: one phone, counted in the louder one's room.
    rows += [("ffffffffffffffff", ground, -80), ("ffffffffffffffff", first, -50)]
    tick = collector_tick(building_id, rows, [ground, first, atrium])

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(client, tick, OBSERVATIONS_URL)
        assert response.status_code == 202, response.text

        for room, expected in {"ground-floor": 3, "first-floor": 7, "atrium": 0}.items():
            stored = telemetry.latest(client, "totalDeviceCount", building_id, room)
            assert stored["totalDeviceCount"] == expected, room

            estimate = telemetry.latest(client, "ratioDeviceCount", building_id, room)
            assert estimate["ratioDeviceCount"] == math.ceil(expected / DEVICES_PER_PERSON)


def test_a_tick_carrying_a_mac_is_refused(routers: tuple[str, dict[str, str]]):
    """Guards the test above: without it, it would pass against a telemetry that accepted anything."""
    building_id, by_room = routers
    tick = collector_tick(building_id, [("ffffffffffffffff", by_room["atrium"], -60)], [])
    tick["connected"][0]["mac"] = "aa:bb:cc:00:00:01"

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(client, tick, OBSERVATIONS_URL)

    assert response.status_code == 400, response.text
