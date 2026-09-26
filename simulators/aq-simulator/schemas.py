from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from scenarios import Scenario


def _strip_newlines(value: str) -> str:
    # Drop CR/LF so user-supplied ids can't forge log lines (log injection).
    return value.replace("\r", "").replace("\n", "")


NonEmpty = Annotated[str, Field(min_length=1)]
Finite = Annotated[float, Field(allow_inf_nan=False)]
Side = Annotated[float, Field(gt=0, allow_inf_nan=False)]


class Coordinates(BaseModel):
    """A point in the twin's frame, y up."""

    model_config = ConfigDict(extra="forbid")

    x: Finite
    y: Finite
    z: Finite


class Dimensions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: Side
    height: Side
    depth: Side


class Room(BaseModel):
    """A room as a box; `position` is its footprint centre at floor level."""

    model_config = ConfigDict(extra="forbid")

    roomId: NonEmpty
    position: Coordinates
    dimensions: Dimensions


class SimulatedSensor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sensorId: NonEmpty
    sensorType: NonEmpty
    roomId: NonEmpty
    position: Coordinates | None = None

    @field_validator("sensorId", "sensorType", "roomId")
    @classmethod
    def clean(cls, v: str) -> str:
        return _strip_newlines(v)


class BuildingConfig(BaseModel):
    """The body telemetry POSTs to /control/start; an empty `sensors` stops the building."""

    # An extra key is refused so the old `targetUrl` can never choose where readings go.
    model_config = ConfigDict(extra="forbid")

    buildingId: NonEmpty
    sensors: list[SimulatedSensor]
    # Absent means no geometry; an empty list would claim a building with no rooms.
    rooms: Annotated[list[Room], Field(min_length=1)] | None = None
    scenario: Scenario = Scenario.CLEAN_INDOOR
    interval_seconds: float = 10.0

    @field_validator("buildingId")
    @classmethod
    def clean_building_id(cls, v: str) -> str:
        return _strip_newlines(v)

    @field_validator("interval_seconds")
    @classmethod
    def interval_positive(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError("interval_seconds must be ≥ 1")
        return v


class StopRequest(BaseModel):
    buildingId: str

    @field_validator("buildingId")
    @classmethod
    def clean_building_id(cls, v: str) -> str:
        return _strip_newlines(v)

class AirQualityReading(BaseModel):
    # ── ADDED DISCRIMINANT FOR MICROKERNEL ──
    type: str = "airQuality"
    # ────────────────────────────────────────

    roomId: str
    timestamp: int
    scenario: str

    # Reported sensor values
    pm25: float
    pm10: float
    co2: float
    voc: float
    temperature: float
    humidity: float

    # Derived
    aqi: int
    indoor_aqi: float

class StatusResponse(BaseModel):
    isRunning: bool
    activeBuildings: list[str] = []