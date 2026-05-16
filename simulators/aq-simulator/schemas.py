from __future__ import annotations

from pydantic import BaseModel, field_validator
from scenarios import Scenario

class BuildingConfig(BaseModel):
    buildingId: str
    roomIds: list[str]
    targetUrl: str
    scenario: Scenario = Scenario.CLEAN_INDOOR
    interval_seconds: float = 10.0

    @field_validator("roomIds")
    @classmethod
    def rooms_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("roomIds must contain at least one room")
        return v

    @field_validator("interval_seconds")
    @classmethod
    def interval_positive(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError("interval_seconds must be ≥ 1")
        return v

class StopRequest(BaseModel):
    buildingId: str

class AirQualityReading(BaseModel):
    # ── ADDED DISCRIMINANT FOR MICROKERNEL ──
    type: str = "airQuality"
    # ────────────────────────────────────────

    buildingId: str
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