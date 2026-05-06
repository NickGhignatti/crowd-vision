from __future__ import annotations

from pydantic import BaseModel, field_validator

from scenarios import Scenario

# --------------------------------------------------------------------------- #
#  API request / response models                                              #
# --------------------------------------------------------------------------- #

class BuildingConfig(BaseModel):
    """
    Body of POST /control/start.
    Mirrors the TypeScript { buildingId, roomIds, targetUrl } payload.
    """
    buildingId: str
    roomIds: list[str]
    targetUrl: str
    scenario: Scenario = Scenario.CLEAN_INDOOR
    interval_seconds: float = 10.0          # how often to emit readings (default: 10 s)

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
    """
    Payload POSTed to {targetUrl}/air-quality for every room on each tick.

    Mirrors the ISignalTemperature shape, extended with the full AQI sensor
    suite plus a computed AQI index.
    """
    buildingId: str
    roomId: str
    timestamp: int               # Unix ms  (matches the TypeScript `Date.now()`)
    scenario: str

    # Reported sensor values (after measurement error has been applied)
    pm25: float                  # µg/m³
    pm10: float                  # µg/m³
    co2: float                   # ppm
    voc: float                   # ppb
    temperature: float           # °C
    humidity: float              # %RH

    # Derived
    aqi: int                     # US EPA AQI computed from PM2.5
    indoor_aqi: float            # Custom Indoor AQI weighted index


class StatusResponse(BaseModel):
    isRunning: bool
    activeBuildings: list[str] = []
