from __future__ import annotations

from typing import Any

from pydantic import BaseModel, field_validator


class ApConfig(BaseModel):
    id: str
    iface: str = "wlan0"
    device: str = ""  # iwinfo device name; defaults to `iface` when unset
    reader: str = "hostapd"  # "hostapd" | "iwinfo" — mirrors AccessPoint.reader in the real collector
    zone_id: str = ""
    x: float = 0.0
    y: float = 0.0
    username: str = "collector"
    password: str = "collector"
    session_ttl_s: float = 300.0

    @field_validator("reader")
    @classmethod
    def reader_known(cls, v: str) -> str:
        if v not in ("hostapd", "iwinfo"):
            raise ValueError("reader must be 'hostapd' or 'iwinfo'")
        return v

    def model_post_init(self, _context: Any, /) -> None:
        if not self.device:
            self.device = self.iface
        if not self.zone_id:
            self.zone_id = self.id


class Waypoint(BaseModel):
    x: float
    y: float
    hold_s: float = 0.0


class DeviceRoute(BaseModel):
    mac: str
    waypoints: list[Waypoint]
    speed_mps: float = 1.2
    phase_offset_s: float = 0.0

    @field_validator("waypoints")
    @classmethod
    def at_least_two(cls, v: list[Waypoint]) -> list[Waypoint]:
        if len(v) < 2:
            raise ValueError("a route needs at least two waypoints")
        return v


class ScenarioConfig(BaseModel):
    aps: list[ApConfig]
    devices: list[DeviceRoute]
    tx_power_dbm: float = -30.0
    path_loss_exponent: float = 2.7
    noise_stddev_db: float = 2.0
    sensitivity_dbm: float = -85.0


class StatusResponse(BaseModel):
    aps: list[str]
    down: list[str]
    devices: list[str]
