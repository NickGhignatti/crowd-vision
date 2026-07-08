from __future__ import annotations

from typing import TYPE_CHECKING, cast

import httpx
import pytest
from pydantic import ValidationError

from app.agent.tools import REGISTRY
from app.agent.tools import access as access_module
from app.agent.tools import downstream as downstream_module
from app.agent.tools import sensor as sensor_module
from app.agent.tools import twin as twin_module
from app.agent.tools.base import ToolContext
from app.agent.tools.sensor import (
    GetLatestSensorDataArgs,
    GetLatestSensorDataTool,
    GetSensorHistoryArgs,
    GetSensorHistoryTool,
    ListSensorsArgs,
    ListSensorsTool,
)
from app.agent.tools.twin import (
    GetBuildingArgs,
    GetBuildingTool,
    ListBuildingsArgs,
    ListBuildingsTool,
    ListRoomsArgs,
    ListRoomsTool,
)
from app.auth import AuthUser

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def _context(
    *,
    roles: list[str] | None = None,
    domains: list[str] | None = None,
    raw_token: str | None = None,
) -> ToolContext:
    return ToolContext(
        user=AuthUser("user-1", roles=roles or [], domains=domains or [], raw_token=raw_token),
        session=cast("AsyncSession", object()),
    )


def _building(*, domains: list[str] | None = None) -> dict:
    return {
        "id": "building-1",
        "name": "Engineering",
        "domains": domains or ["unibo.it"],
        "rooms": [
            {
                "id": "room-1",
                "name": "Lab",
                "capacity": 30,
                "position": {"x": 0, "y": 0, "z": 0},
                "dimensions": {"width": 5, "height": 3, "depth": 4},
                "color": "#fff",
            }
        ],
        "_id": "internal-mongo-id",
    }


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url="http://service.test",
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.asyncio
async def test_list_buildings_rejects_domain_outside_caller_scope(monkeypatch):
    def unexpected_client():
        raise AssertionError("unauthorized requests must not reach twin-service")

    monkeypatch.setattr(twin_module, "get_twin_client", unexpected_client)

    result = await ListBuildingsTool().run(
        ListBuildingsArgs(domain="other.example"),
        _context(domains=["unibo.it"]),
    )

    assert result.is_error is True
    assert result.content == "domain unavailable or inaccessible"


@pytest.mark.asyncio
async def test_global_admin_can_list_an_arbitrary_domain(monkeypatch):
    client = _client(
        lambda request: httpx.Response(200, json=[_building(domains=["other.example"])])
    )
    monkeypatch.setattr(twin_module, "get_twin_client", lambda: client)
    try:
        result = await ListBuildingsTool().run(
            ListBuildingsArgs(domain="other.example"),
            _context(roles=["admin"]),
        )
    finally:
        await client.aclose()

    assert result.is_error is False
    assert result.content["buildings"][0]["name"] == "Engineering"


@pytest.mark.asyncio
async def test_direct_building_lookup_does_not_reveal_inaccessible_building(monkeypatch):
    client = _client(
        lambda request: httpx.Response(200, json=_building(domains=["private.example"]))
    )
    monkeypatch.setattr(access_module, "get_twin_client", lambda: client)
    try:
        result = await GetBuildingTool().run(
            GetBuildingArgs(building_id="building-1"),
            _context(domains=["unibo.it"]),
        )
    finally:
        await client.aclose()

    assert result.is_error is True
    assert result.content == "building unavailable or inaccessible"
    assert "Engineering" not in str(result.content)


@pytest.mark.asyncio
async def test_list_rooms_returns_structural_data_only(monkeypatch):
    client = _client(lambda request: httpx.Response(200, json=_building()))
    monkeypatch.setattr(access_module, "get_twin_client", lambda: client)
    try:
        result = await ListRoomsTool().run(
            ListRoomsArgs(building_id="building-1"),
            _context(domains=["unibo.it"]),
        )
    finally:
        await client.aclose()

    room = result.content["rooms"][0]
    assert room["name"] == "Lab"
    assert room["capacity"] == 30
    assert "no_person" not in room
    assert "temperature" not in room


@pytest.mark.asyncio
async def test_latest_sensor_data_projects_and_names_building_readings(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))

    def sensor_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/peopleCount/entireBuilding"
        assert request.url.params["building"] == "building-1"
        assert request.headers["Authorization"] == "Bearer caller-jwt"
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "building": "building-1",
                        "roomId": "room-1",
                        "timestamp": 1710000000000,
                        "value": 17,
                        "_id": "internal",
                    }
                ]
            },
        )

    sensor_client = _client(sensor_handler)
    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", lambda: sensor_client)
    try:
        result = await GetLatestSensorDataTool().run(
            GetLatestSensorDataArgs(building_id="building-1", metric="peopleCount"),
            _context(domains=["unibo.it"], raw_token="caller-jwt"),
        )
    finally:
        await twin_client.aclose()
        await sensor_client.aclose()

    assert result.is_error is False
    assert result.content["unit"] == "people"
    assert result.content["readings"] == [
        {
            "room_id": "room-1",
            "room_name": "Lab",
            "timestamp": 1710000000000,
            "value": 17,
        }
    ]


@pytest.mark.asyncio
async def test_latest_sensor_data_discards_out_of_scope_downstream_rows(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))
    sensor_client = _client(
        lambda request: httpx.Response(
            200,
            json={
                "data": [
                    {
                        "building": "other-building",
                        "roomId": "room-1",
                        "timestamp": 1,
                        "value": 99,
                    },
                    {
                        "building": "building-1",
                        "roomId": "unknown-room",
                        "timestamp": 1,
                        "value": 99,
                    },
                ]
            },
        )
    )
    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", lambda: sensor_client)
    try:
        result = await GetLatestSensorDataTool().run(
            GetLatestSensorDataArgs(building_id="building-1", metric="peopleCount"),
            _context(domains=["unibo.it"]),
        )
    finally:
        await twin_client.aclose()
        await sensor_client.aclose()

    assert result.is_error is False
    assert result.content["readings"] == []
    assert result.content["note"] == "no sensor data available"


@pytest.mark.asyncio
async def test_latest_sensor_data_checks_room_before_sensor_request(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))

    def unexpected_sensor_client():
        raise AssertionError("unknown rooms must not reach sensor-service")

    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", unexpected_sensor_client)
    try:
        result = await GetLatestSensorDataTool().run(
            GetLatestSensorDataArgs(
                building_id="building-1",
                room_id="missing-room",
                metric="temperature",
            ),
            _context(domains=["unibo.it"]),
        )
    finally:
        await twin_client.aclose()

    assert result.is_error is True
    assert result.content == "room unavailable or inaccessible"


@pytest.mark.asyncio
async def test_sensor_history_forwards_validated_query_and_projects_points(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))

    def sensor_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/temperature/dashboard"
        assert request.url.params["building"] == "building-1"
        assert request.url.params["roomId"] == "room-1"
        assert request.url.params["timeRange"] == "1W"
        assert request.url.params["aggMode"] == "max"
        assert request.headers["Authorization"] == "Bearer caller-jwt"
        return httpx.Response(
            200,
            json={
                "data": [
                    {"timestamp": 1710000000000, "value": 24.5, "ignored": "field"},
                ]
            },
        )

    sensor_client = _client(sensor_handler)
    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", lambda: sensor_client)
    try:
        result = await GetSensorHistoryTool().run(
            GetSensorHistoryArgs(
                building_id="building-1",
                room_id="room-1",
                metric="temperature",
                time_range="1W",
                aggregation="max",
            ),
            _context(domains=["unibo.it"], raw_token="caller-jwt"),
        )
    finally:
        await twin_client.aclose()
        await sensor_client.aclose()

    assert result.is_error is False
    assert result.content["room_name"] == "Lab"
    assert result.content["points"] == [{"timestamp": 1710000000000, "value": 24.5}]


@pytest.mark.asyncio
async def test_list_sensors_projects_room_devices_and_forwards_auth(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))

    def sensor_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/sensors/buildings/building-1/rooms/room-1"
        assert request.headers["Authorization"] == "Bearer caller-jwt"
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "buildingId": "building-1",
                        "roomId": "room-1",
                        "sensorId": "temp-01",
                        "sensorType": "temperature",
                        "_id": "internal",
                    }
                ]
            },
        )

    sensor_client = _client(sensor_handler)
    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", lambda: sensor_client)
    try:
        result = await ListSensorsTool().run(
            ListSensorsArgs(building_id="building-1", room_id="room-1"),
            _context(domains=["unibo.it"], raw_token="caller-jwt"),
        )
    finally:
        await twin_client.aclose()
        await sensor_client.aclose()

    assert result.is_error is False
    assert result.content["building_name"] == "Engineering"
    assert result.content["sensors"] == [
        {
            "sensor_id": "temp-01",
            "sensor_type": "temperature",
            "room_id": "room-1",
            "room_name": "Lab",
        }
    ]


@pytest.mark.asyncio
async def test_list_sensors_discards_out_of_scope_devices(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))
    sensor_client = _client(
        lambda request: httpx.Response(
            200,
            json={
                "data": [
                    {
                        "buildingId": "other-building",
                        "roomId": "room-1",
                        "sensorId": "temp-01",
                        "sensorType": "temperature",
                    },
                    {
                        "buildingId": "building-1",
                        "roomId": "unknown-room",
                        "sensorId": "temp-02",
                        "sensorType": "temperature",
                    },
                ]
            },
        )
    )
    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", lambda: sensor_client)
    try:
        result = await ListSensorsTool().run(
            ListSensorsArgs(building_id="building-1"),
            _context(domains=["unibo.it"]),
        )
    finally:
        await twin_client.aclose()
        await sensor_client.aclose()

    assert result.is_error is False
    assert result.content["sensors"] == []
    assert result.content["note"] == "no sensors registered"


@pytest.mark.asyncio
async def test_list_sensors_checks_room_before_sensor_request(monkeypatch):
    twin_client = _client(lambda request: httpx.Response(200, json=_building()))

    def unexpected_sensor_client():
        raise AssertionError("unknown rooms must not reach sensor-service")

    monkeypatch.setattr(access_module, "get_twin_client", lambda: twin_client)
    monkeypatch.setattr(sensor_module, "get_sensor_client", unexpected_sensor_client)
    try:
        result = await ListSensorsTool().run(
            ListSensorsArgs(building_id="building-1", room_id="missing-room"),
            _context(domains=["unibo.it"]),
        )
    finally:
        await twin_client.aclose()

    assert result.is_error is True
    assert result.content == "room unavailable or inaccessible"


def test_sensor_history_rejects_sum_for_non_additive_metrics():
    with pytest.raises(ValidationError, match="only meaningful for peopleCount"):
        GetSensorHistoryArgs(
            building_id="building-1",
            metric="temperature",
            time_range="1D",
            aggregation="sum",
        )


def test_registry_exposes_sensor_tools():
    names = {schema.name for schema in REGISTRY.schemas()}
    assert {"get_latest_sensor_data", "get_sensor_history", "list_sensors"} <= names


@pytest.mark.asyncio
async def test_downstream_get_retries_one_transient_response():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503 if attempts == 1 else 200, json={"ok": True})

    client = _client(handler)
    try:
        response = await downstream_module.get_with_retry(client, "/health")
    finally:
        await client.aclose()

    assert response.status_code == 200
    assert attempts == 2
