import hashlib
import hmac
import json
import time
import uuid

import httpx

from support import config
from support.claims import claims_header


def new_room(
    building_id: str | None = None, room_id: str | None = None
) -> tuple[str, str]:
    """A fresh, isolated (building, room) pair per test — no dependency on
    twin-service's registration flow, since contracts-service's dashboard
    preference (see register_dashboard_preference) is the only thing this
    pipeline actually needs to exist first.
    """
    return (
        building_id or f"bldg-{uuid.uuid4().hex[:12]}",
        room_id or f"room-{uuid.uuid4().hex[:8]}",
    )


def register_dashboard_preference(client: httpx.Client, building_id: str) -> None:
    """A raw telemetry event is silently dropped by contracts-service unless
    the building already has a dashboard preference row — see
    backend/contracts-service/src/tunnel.rs::resolve_channel. Every LD-4 test
    needs this before ingesting, or the socket event never arrives and the
    test just times out looking like a hang, not a clear failure.
    """
    response = client.post(
        f"{config.CONTRACTS_SERVICE_URL}/preferences/init/{building_id}",
        headers={"x-gateway-claims": claims_header()},
    )
    response.raise_for_status()


def ingest_temperature(
    client: httpx.Client,
    building_id: str,
    room_id: str,
    value: float,
    timestamp_ms: int | None = None,
) -> httpx.Response:
    body = {
        "type": "temperature",
        "buildingId": building_id,
        "roomId": room_id,
        "timestamp": timestamp_ms if timestamp_ms is not None else int(time.time() * 1000),
        "temperature": value,
    }
    return post_reading(client, body)


def post_reading(client: httpx.Client, body: dict) -> httpx.Response:
    """Signed exactly like a real gateway: HMAC-SHA256 over the bytes on the wire,
    so the body is serialised here rather than by httpx's json= encoder.
    """
    raw = json.dumps(body, separators=(",", ":")).encode()
    signature = hmac.new(
        config.TELEMETRY_INGEST_SECRET.encode(), raw, hashlib.sha256
    ).hexdigest()
    return client.post(
        f"{config.TELEMETRY_SERVICE_URL}/ingest",
        content=raw,
        headers={"content-type": "application/json", "x-signature": signature},
    )


def latest_temperature(client: httpx.Client, building_id: str, room_id: str) -> dict:
    response = client.get(
        f"{config.TELEMETRY_SERVICE_URL}/temperature/latest",
        params={"building": building_id, "roomId": room_id},
        headers={"x-gateway-claims": claims_header()},
    )
    response.raise_for_status()
    return response.json()["data"]
