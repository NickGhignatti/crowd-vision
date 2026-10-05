from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class BuildingStatus(BaseModel):
    isRunning: bool
    activeBuildings: list[str]


class StopRequest(BaseModel):
    buildingId: str


NonEmpty = Annotated[str, Field(min_length=1)]


class SimulatedSensor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sensorId: NonEmpty
    sensorType: NonEmpty
    roomId: NonEmpty


class BuildingStart(BaseModel):
    """The body telemetry POSTs to /control/start; an empty `sensors` stops the building."""

    # An extra key is refused so the old `targetUrl` can never choose where readings go.
    model_config = ConfigDict(extra="forbid")

    buildingId: NonEmpty
    sensors: list[SimulatedSensor]
