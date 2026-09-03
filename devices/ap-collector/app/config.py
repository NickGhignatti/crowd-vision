from __future__ import annotations

import json
import os
from pathlib import Path

READERS = ("hostapd", "iwinfo")


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
        self, buildings: list[Building], poll_interval: int = 60, default_timeout: int = 60 * 10
    ):
        self.buildings = buildings
        self.poll_interval: int = poll_interval
        self.default_timeout: int = default_timeout

    def load_from_config_file(self, config_file_path: str) -> None:
        with Path.open(Path(config_file_path)) as f:
            data = json.load(f)
        buildings = [Building.from_json(building) for building in data]
        self._validate(buildings)
        self.buildings = buildings

    def load_env(self) -> None:
        self.telemetry_service = os.getenv("TELEMETRY_SERVICE_URL")
        self.telemetry_secret = os.getenv("TELEMETRY_SERVICE_SECRET")

        if not self.telemetry_service:
            raise ValueError("config: TELEMETRY_SERVICE_URL must be set")
        if not self.telemetry_secret:
            raise ValueError("config: TELEMETRY_SERVICE_SECRET must be set")

    def _validate(self, buildings: list[Building]) -> None:
        if not buildings:
            raise ValueError("config: buildings must not be empty")
        names = [b.name for b in buildings]
        if len(set(names)) != len(names):
            raise ValueError("config: building names must be unique")
