import math
import time

import httpx
import pytest

from support import telemetry

DEVICES_PER_PERSON = 2.5


def collector_tick(now_ms: int, counts: dict[str, int]) -> list[dict]:
    """One tick's readings, shaped exactly like `collector.readings_for_building`.

    Written out rather than imported: the acceptance container mounts only
    `backend/acceptance`, and importing the collector would make this assert that
    the producer agrees with itself. Spelled out, it asserts the *wire shape*
    telemetry accepts, which is the thing that actually drifted.
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
    """Every zone, both metrics, one batch. Ingest is all-or-nothing, so a single
    unknown key or missing field would 400 the entire tick rather than part of it.
    """
    counts = {"ground-floor": 9, "first-floor": 4, "atrium": 0}
    body = {
        "buildingId": building_id,
        "readings": collector_tick(int(time.time() * 1000), counts),
    }

    with httpx.Client(timeout=10.0) as client:
        response = telemetry.post_reading(client, body)

    assert response.status_code == 202, response.text


def test_both_metrics_are_stored_per_zone(building_id: str):
    """The zone name travels as `roomId` and comes back keyed by it -- proof the
    reading reached Postgres under the metric the plugin registered, not merely
    that ingest liked the payload.
    """
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
    """Zero is a measurement: the zone answered and heard nobody. Dropping it
    would leave the dashboard showing the last non-zero count indefinitely.
    """
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
    """The guard on every test above. Without it they would still pass against a
    telemetry that accepted anything -- and `deviceCount` is the exact key that
    drifted, so this is the regression, not a hypothetical.
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
    """`roomId` is read unconditionally downstream, so an absent one would land as
    "" in a not-null column: a device count attributed to nowhere.
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
