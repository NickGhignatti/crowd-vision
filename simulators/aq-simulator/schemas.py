from __future__ import annotations

from pydantic import BaseModel, field_validator
from scenarios import Scenario

def _strip_newlines(value: str) -> str:
    # Drop CR/LF so user-supplied ids can't forge log lines (log injection).
    return value.replace("\r", "").replace("\n", "")


class BuildingConfig(BaseModel):
    buildingId: str
    roomIds: list[str]
    targetUrl: str
    scenario: Scenario = Scenario.CLEAN_INDOOR
    interval_seconds: float = 10.0

    @field_validator("buildingId")
    @classmethod
    def clean_building_id(cls, v: str) -> str:
        return _strip_newlines(v)

    @field_validator("roomIds")
    @classmethod
    def rooms_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("roomIds must contain at least one room")
        return [_strip_newlines(r) for r in v]

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