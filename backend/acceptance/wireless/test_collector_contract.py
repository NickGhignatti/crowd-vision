"""The ap-collector's wire contract against a real telemetry: Python producer, Rust
consumer, nothing compiling them together. Both unit suites once passed while disagreeing.
"""

import math
import time

import httpx
import pytest

from support import telemetry

DEVICES_PER_PERSON = 2.5


def collector_tick(now_ms: int, counts: dict[str, int]) -> list[dict]:
    """One tick's readings, shaped like `collector.readings_for_building`.

    Written out, not imported: importing it would assert the producer agrees with itself.
    """
    readings = [
        {
            "type": "totalDeviceCount",
            "roomId": zone,
            "timestamp": now_ms,
            "totalDeviceCount": n,
        }
        for zone, n in counts.items()
    ]
    readings += [
        {
            "type": "ratioDeviceCount",
            "roomId": zone,
            "timestamp": now_ms,
            # Ceiling, matching the collector: a zone holding one device is not empty.
            "ratioDeviceCount": math.ceil(n / DEVICES_PER_PERSON),
        }
        for zone, n in counts.items()
    ]
    return readings


@pytest.fixture(scope="module")
def building_id() -> str:
    return telemetry.new_room()[0]


def test_a_whole_collector_tick_is_accepted(building_id: str):
    """Ingest is all-or-nothing: one unknown key would reject the whole tick."""
    counts = {"ground-floor": 9, "first-floor": 4, "atrium": 0}
    body = {
        "buildingId": building_id,
        "readings": collector_tick(int(time.time() * 1000), counts),
    }

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(client, body)

    assert response.status_code == 202, response.text


def test_both_metrics_are_stored_per_zone(building_id: str):
    """Reads back per zone: proof it reached Postgres, not just that ingest accepted it."""
    counts = {"ground-floor": 3, "first-floor": 6, "atrium": 9}
    now_ms = int(time.time() * 1000)

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(
            client,
            {"buildingId": building_id, "readings": collector_tick(now_ms, counts)},
        )
        assert response.status_code == 202, response.text

        for zone, expected in counts.items():
            stored = telemetry.latest(client, "totalDeviceCount", building_id, zone)
            assert stored["totalDeviceCount"] == expected

            estimate = telemetry.latest(client, "ratioDeviceCount", building_id, zone)
            assert estimate["ratioDeviceCount"] == math.ceil(
                expected / DEVICES_PER_PERSON
            )


def test_an_empty_zone_is_stored_rather_than_dropped(building_id: str):
    """Zero is a measurement -- dropping it strands the last non-zero count on screen."""
    zone = "empty-wing"
    body = {
        "buildingId": building_id,
        "readings": [
            {
                "type": "totalDeviceCount",
                "roomId": zone,
                "timestamp": int(time.time() * 1000),
                "totalDeviceCount": 0,
            }
        ],
    }

    with httpx.Client(timeout=10.0) as client:
        assert telemetry.post_reading(client, body).status_code == 202
        stored = telemetry.latest(client, "totalDeviceCount", building_id, zone)

    assert stored["totalDeviceCount"] == 0


def test_a_drifted_metric_key_is_rejected(building_id: str):
    """Guards the tests above: without it they would pass against a telemetry that
    accepted anything. `deviceCount` is the key that actually drifted.
    """
    body = {
        "buildingId": building_id,
        "readings": [
            {
                "type": "deviceCount",
                "roomId": "ground-floor",
                "timestamp": int(time.time() * 1000),
                "deviceCount": 9,
            }
        ],
    }

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(client, body)

    assert response.status_code == 422, response.text
    assert "unknown sensor type: deviceCount" in response.text


def test_a_reading_without_a_zone_is_rejected(building_id: str):
    """roomId is read unconditionally downstream: absent, it lands as "" in a not-null
    column -- a device count attributed to nowhere.
    """
    body = {
        "buildingId": building_id,
        "readings": [
            {
                "type": "totalDeviceCount",
                "timestamp": int(time.time() * 1000),
                "totalDeviceCount": 9,
            }
        ],
    }

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(client, body)

    assert response.status_code == 422, response.text
    assert "roomId: must be a non-empty string" in response.text
