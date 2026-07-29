from __future__ import annotations

from typing import Any, Literal
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field, model_validator

from app.agent.tools.access import get_authorized_building
from app.agent.tools.base import ToolContext, ToolResult
from app.agent.tools.downstream import (
    auth_headers,
    downstream_error,
    get_sensor_client,
    get_with_retry,
)

SensorMetric = Literal["peopleCount", "temperature", "airQuality"]
TimeRange = Literal["1D", "1W", "1M"]
Aggregation = Literal["avg", "sum", "min", "max"]

_METRIC_METADATA: dict[str, dict[str, str]] = {
    "peopleCount": {"label": "People Count", "unit": "people"},
    "temperature": {"label": "Temperature", "unit": "C"},
    "airQuality": {"label": "Indoor Air Quality Index", "unit": "AQI"},
}


def _room_index(building: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw_rooms = building.get("rooms", [])
    if not isinstance(raw_rooms, list):
        return {}
    return {
        str(room.get("id")): room
        for room in raw_rooms
        if isinstance(room, dict) and room.get("id") is not None
    }


def _reading_matches_scope(
    reading: dict[str, Any],
    *,
    building_id: str,
    room_id: str | None,
    rooms: dict[str, dict[str, Any]],
) -> bool:
    reading_room = str(reading.get("roomId", ""))
    return (
        str(reading.get("building", "")) == building_id
        and reading_room in rooms
        and (room_id is None or reading_room == room_id)
    )


def _validate_room(
    building: dict[str, Any],
    room_id: str | None,
) -> tuple[dict[str, dict[str, Any]], ToolResult | None]:
    rooms = _room_index(building)
    if room_id is not None and room_id not in rooms:
        return rooms, ToolResult(content="room unavailable or inaccessible", is_error=True)
    return rooms, None


def _project_latest(
    metric: SensorMetric,
    reading: dict[str, Any],
    rooms: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    room_id = str(reading.get("roomId", ""))
    payload: dict[str, Any] = {
        "room_id": room_id,
        "room_name": rooms.get(room_id, {}).get("name"),
        "timestamp": reading.get("timestamp"),
    }
    if metric == "peopleCount":
        payload["value"] = reading.get("peopleCount", reading.get("value"))
    elif metric == "temperature":
        payload["value"] = reading.get("temperature", reading.get("value"))
    else:
        payload.update(
            {
                "value": reading.get("indoor_aqi", reading.get("indoorAqi")),
                "indoor_aqi": reading.get("indoor_aqi", reading.get("indoorAqi")),
                "pm25": reading.get("pm25"),
                "pm10": reading.get("pm10"),
                "co2": reading.get("co2"),
                "voc": reading.get("voc"),
                "humidity": reading.get("humidity"),
                "aqi": reading.get("aqi"),
            }
        )
    return {key: value for key, value in payload.items() if value is not None}


def _sensor_empty_payload(
    building: dict[str, Any],
    metric: SensorMetric,
    *,
    key: str,
) -> dict[str, Any]:
    metadata = _METRIC_METADATA[metric]
    return {
        "building_id": building.get("id"),
        "building_name": building.get("name"),
        "metric": metric,
        "label": metadata["label"],
        "unit": metadata["unit"],
        key: [],
        "note": "no sensor data available",
    }


class GetLatestSensorDataArgs(BaseModel):
    building_id: str = Field(description="Building whose latest sensor readings are needed.")
    metric: SensorMetric = Field(
        description="Sensor metric: peopleCount, temperature, or airQuality."
    )
    room_id: str | None = Field(
        default=None,
        description=(
            "Optional room id. Omit it to get the latest reading for every room in the building."
        ),
    )


class GetLatestSensorDataTool:
    name = "get_latest_sensor_data"
    description = (
        "Fetch the latest available live sensor readings for one room or every room in an "
        "authorized building. Supports people count, temperature, and air quality. Use for "
        "current occupancy, crowded-room, temperature, and air-quality questions. The returned "
        "timestamps indicate freshness; do not claim a reading is current if it is old."
    )
    Args = GetLatestSensorDataArgs

    async def run(self, args: GetLatestSensorDataArgs, ctx: ToolContext) -> ToolResult:
        building, error = await get_authorized_building(args.building_id, ctx)
        if error is not None:
            return error
        assert building is not None

        rooms, error = _validate_room(building, args.room_id)
        if error is not None:
            return error

        path = (
            f"/{args.metric}/latest"
            if args.room_id is not None
            else f"/{args.metric}/entireBuilding"
        )
        params: dict[str, str] = {"building": args.building_id}
        if args.room_id is not None:
            params["roomId"] = args.room_id

        try:
            response = await get_with_retry(
                get_sensor_client(),
                path,
                params=params,
                headers=auth_headers(ctx.user),
            )
        except httpx.HTTPError:
            return ToolResult(content="sensor-service is unavailable", is_error=True)

        if response.status_code == 400:
            return ToolResult(content=_sensor_empty_payload(building, args.metric, key="readings"))
        if response.status_code >= 400:
            return ToolResult(
                content=downstream_error("sensor-service", response),
                is_error=True,
            )
        try:
            body = response.json()
        except ValueError:
            return ToolResult(content="sensor-service returned invalid data", is_error=True)
        if not isinstance(body, dict):
            return ToolResult(content="sensor-service returned invalid data", is_error=True)

        raw_data = body.get("data")
        if args.room_id is not None:
            raw_readings = [raw_data] if isinstance(raw_data, dict) else []
        else:
            raw_readings = raw_data if isinstance(raw_data, list) else []
        readings = [
            _project_latest(args.metric, reading, rooms)
            for reading in raw_readings
            if isinstance(reading, dict)
            and _reading_matches_scope(
                reading,
                building_id=args.building_id,
                room_id=args.room_id,
                rooms=rooms,
            )
        ]

        metadata = _METRIC_METADATA[args.metric]
        return ToolResult(
            content={
                "building_id": building.get("id"),
                "building_name": building.get("name"),
                "metric": args.metric,
                "label": metadata["label"],
                "unit": metadata["unit"],
                "readings": readings,
                **({"note": "no sensor data available"} if not readings else {}),
            }
        )


class ListSensorsArgs(BaseModel):
    building_id: str = Field(description="Building whose installed sensor devices are needed.")
    room_id: str | None = Field(
        default=None,
        description=(
            "Optional room id. Omit it to list the sensor devices installed in every room "
            "of the building."
        ),
    )


class ListSensorsTool:
    name = "list_sensors"
    description = (
        "List the physical sensor devices registered in one room or every room of an "
        "authorized building: sensor id and sensor type (temperature, peopleCount, "
        "airQuality). Use to check what a room can measure — e.g. whether it has a "
        "temperature sensor. This returns the device inventory only; for actual "
        "measurements use get_latest_sensor_data or get_sensor_history."
    )
    Args = ListSensorsArgs

    async def run(self, args: ListSensorsArgs, ctx: ToolContext) -> ToolResult:
        building, error = await get_authorized_building(args.building_id, ctx)
        if error is not None:
            return error
        assert building is not None

        rooms, error = _validate_room(building, args.room_id)
        if error is not None:
            return error

        path = f"/sensors/buildings/{quote(args.building_id, safe='')}"
        if args.room_id is not None:
            path += f"/rooms/{quote(args.room_id, safe='')}"

        try:
            response = await get_with_retry(
                get_sensor_client(),
                path,
                headers=auth_headers(ctx.user),
            )
        except httpx.HTTPError:
            return ToolResult(content="sensor-service is unavailable", is_error=True)

        if response.status_code >= 400:
            return ToolResult(
                content=downstream_error("sensor-service", response),
                is_error=True,
            )
        try:
            body = response.json()
        except ValueError:
            return ToolResult(content="sensor-service returned invalid data", is_error=True)
        if not isinstance(body, dict):
            return ToolResult(content="sensor-service returned invalid data", is_error=True)

        raw_sensors = body.get("data")
        sensors = [
            {
                "sensor_id": device.get("sensorId"),
                "sensor_type": device.get("sensorType"),
                "room_id": str(device.get("roomId")),
                "room_name": rooms.get(str(device.get("roomId")), {}).get("name"),
            }
            for device in (raw_sensors if isinstance(raw_sensors, list) else [])
            if isinstance(device, dict)
            and str(device.get("buildingId", "")) == args.building_id
            and str(device.get("roomId", "")) in rooms
            and (args.room_id is None or str(device.get("roomId", "")) == args.room_id)
        ]

        return ToolResult(
            content={
                "building_id": building.get("id"),
                "building_name": building.get("name"),
                "room_id": args.room_id,
                "sensors": sensors,
                **({"note": "no sensors registered"} if not sensors else {}),
            }
        )


class GetSensorHistoryArgs(BaseModel):
    building_id: str = Field(description="Building whose historical sensor data is needed.")
    metric: SensorMetric = Field(
        description="Sensor metric: peopleCount, temperature, or airQuality."
    )
    time_range: TimeRange = Field(description="Historical window: 1D, 1W, or 1M.")
    aggregation: Aggregation = Field(
        default="avg",
        description="Bucket aggregation: avg, sum, min, or max.",
    )
    room_id: str | None = Field(
        default=None,
        description="Optional room id. Omit it to aggregate readings across the building.",
    )

    @model_validator(mode="after")
    def reject_meaningless_sum(self) -> GetSensorHistoryArgs:
        if self.metric != "peopleCount" and self.aggregation == "sum":
            raise ValueError("sum aggregation is only meaningful for peopleCount")
        return self


class GetSensorHistoryTool:
    name = "get_sensor_history"
    description = (
        "Fetch bucketed historical sensor data for an authorized building or room over the "
        "last day, week, or month. Use for trends, peaks, minima, averages, or total occupancy. "
        "For the latest per-room state, use get_latest_sensor_data instead."
    )
    Args = GetSensorHistoryArgs

    async def run(self, args: GetSensorHistoryArgs, ctx: ToolContext) -> ToolResult:
        building, error = await get_authorized_building(args.building_id, ctx)
        if error is not None:
            return error
        assert building is not None

        rooms, error = _validate_room(building, args.room_id)
        if error is not None:
            return error

        params = {
            "building": args.building_id,
            "timeRange": args.time_range,
            "aggMode": args.aggregation,
        }
        if args.room_id is not None:
            params["roomId"] = args.room_id

        try:
            response = await get_with_retry(
                get_sensor_client(),
                f"/{args.metric}/dashboard",
                params=params,
                headers=auth_headers(ctx.user),
            )
        except httpx.HTTPError:
            return ToolResult(content="sensor-service is unavailable", is_error=True)

        if response.status_code == 400:
            return ToolResult(content=_sensor_empty_payload(building, args.metric, key="points"))
        if response.status_code >= 400:
            return ToolResult(
                content=downstream_error("sensor-service", response),
                is_error=True,
            )
        try:
            body = response.json()
        except ValueError:
            return ToolResult(content="sensor-service returned invalid data", is_error=True)
        if not isinstance(body, dict):
            return ToolResult(content="sensor-service returned invalid data", is_error=True)

        raw_points = body.get("data")
        points = (
            [
                {"timestamp": point.get("timestamp"), "value": point.get("value")}
                for point in raw_points
                if isinstance(point, dict)
            ]
            if isinstance(raw_points, list)
            else []
        )
        metadata = _METRIC_METADATA[args.metric]
        return ToolResult(
            content={
                "building_id": building.get("id"),
                "building_name": building.get("name"),
                "room_id": args.room_id,
                "room_name": rooms.get(args.room_id, {}).get("name") if args.room_id else None,
                "metric": args.metric,
                "label": metadata["label"],
                "unit": metadata["unit"],
                "time_range": args.time_range,
                "aggregation": args.aggregation,
                "points": points,
                **({"note": "no sensor data available"} if not points else {}),
            }
        )
