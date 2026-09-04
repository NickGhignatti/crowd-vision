from __future__ import annotations

import json
import os
from pathlib import Path

READERS = ("hostapd", "iwinfo")
DEFAULT_POLL_INTERVAL = 60
DEFAULT_REQUEST_TIMEOUT = 10
"""Must stay <= DEFAULT_POLL_INTERVAL -- see Config._validate."""
DEFAULT_DEVICES_PER_PERSON = 2.5
"""Used only when useDevicesPerPerson is true and devicesPerPerson is omitted."""


class AccessPoint:
    def __init__(
        self,
        name="",
        zone="",
        url="",
        username="",
        password="",
        ifaces=(),
        reader="hostapd",
    ):
        self.name = name
        self.zone = zone
        self.url = url
        self.username = username
        self.password = password
        self.ifaces = ifaces
        self.reader = reader

    @classmethod
    def from_json(cls, data: dict) -> AccessPoint:
        ap = cls(**data)
        ap.validate()
        return ap

    def validate(self) -> None:
        for field in ("name", "zone", "url", "username"):
            value = getattr(self, field)
            if not isinstance(value, str) or not value:
                raise ValueError(f"ap: {field} must be a non-empty string")
        if not self.ifaces or not all(isinstance(i, str) and i for i in self.ifaces):
            raise ValueError(f"ap[{self.name}]: ifaces must be a non-empty list of interface names")
        if self.reader not in READERS:
            raise ValueError(f"ap[{self.name}]: reader must be one of {READERS}")


class Building:
    def __init__(self, name: str = "", ap: list[AccessPoint] | None = None):
        self.name = name
        self.ap = ap if ap is not None else []

    @classmethod
    def from_json(cls, data: dict) -> Building:
        aps = [AccessPoint.from_json(entry) for entry in data.get("ap", [])]
        building = cls(name=data.get("name", ""), ap=aps)
        building.validate()
        return building

    def validate(self) -> None:
        if not isinstance(self.name, str) or not self.name:
            raise ValueError("building: name must be a non-empty string")
        if not self.ap:
            raise ValueError(f"building[{self.name}]: ap must not be empty")
        names = [ap.name for ap in self.ap]
        if len(set(names)) != len(names):
            raise ValueError(f"building[{self.name}]: ap names must be unique")

    def get_ap(self, name: str) -> AccessPoint | None:
        for ap in self.ap:
            if ap.name == name:
                return ap
        return None


class Config:
    def __init__(
        self,
        buildings: list[Building],
        poll_interval: int = DEFAULT_POLL_INTERVAL,
        default_timeout: int = DEFAULT_REQUEST_TIMEOUT,
        devices_per_person: float | None = None,
    ):
        self.buildings = buildings
        self.poll_interval: int = poll_interval
        self.default_timeout: int = default_timeout
        self.devices_per_person: float | None = devices_per_person

    def load_from_config_file(self, config_file_path: str) -> None:
        with Path.open(Path(config_file_path)) as f:
            data = json.load(f)
        buildings = [Building.from_json(building) for building in data.get("buildings", [])]
        poll_interval = data.get("pollIntervalS", DEFAULT_POLL_INTERVAL)
        default_timeout = data.get("requestTimeoutS", DEFAULT_REQUEST_TIMEOUT)
        devices_per_person = (
            data.get("devicesPerPerson", DEFAULT_DEVICES_PER_PERSON)
            if data.get("useDevicesPerPerson", False)
            else None
        )
        self._validate(buildings, poll_interval, default_timeout, devices_per_person)
        self.buildings = buildings
        self.poll_interval = poll_interval
        self.default_timeout = default_timeout
        self.devices_per_person = devices_per_person

    def load_env(self) -> None:
        telemetry_service = os.getenv("TELEMETRY_SERVICE_URL")
        telemetry_secret = os.getenv("TELEMETRY_SERVICE_SECRET")

        if not telemetry_service:
            raise ValueError("config: TELEMETRY_SERVICE_URL must be set")
        if not telemetry_secret:
            raise ValueError("config: TELEMETRY_SERVICE_SECRET must be set")

        self.telemetry_service = telemetry_service
        self.telemetry_secret = telemetry_secret

    def _validate(
        self,
        buildings: list[Building],
        poll_interval: float,
        default_timeout: float,
        devices_per_person: float | None,
    ) -> None:
        if not buildings:
            raise ValueError("config: buildings must not be empty")
        names = [b.name for b in buildings]
        if len(set(names)) != len(names):
            raise ValueError("config: building names must be unique")
        if default_timeout > poll_interval:
            # Otherwise a single unreachable AP holds a tick open past when the next one
            # should start, and the real poll rate drifts away from what phase 3's hysteresis
            # numbers were tuned against.
            raise ValueError("config: requestTimeoutS must not exceed pollIntervalS")
        if devices_per_person is not None and devices_per_person <= 0:
            raise ValueError("config: devicesPerPerson must be positive")
