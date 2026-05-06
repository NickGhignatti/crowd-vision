"""
SimulatorService
================
Orchestrates all three simulation layers for one or more buildings:

  Layer 1 — SensorPhysics      : compute_all()
  Layer 2 — EnvironmentModel   : advance() each tick
  Layer 3 — SensorErrorModel   : apply() degradation

One SimulationRoom owns the state (EnvironmentModel + SensorErrorModel) for
a single room. The Simulator class manages all active buildings and rooms,
ticks them on a configurable schedule, and POSTs the results to the target URL.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

import httpx

from schemas import AirQualityReading, BuildingConfig
from scenarios import EnvironmentModel, Scenario
from errors import SensorErrorModel
from physics import compute_all, pm25_to_aqi

logger = logging.getLogger("simulator")

@dataclass
class SimulationRoom:
    """
    Holds the full simulation state for one physical room.

    Owns an EnvironmentModel (Layer 2) and a SensorErrorModel (Layer 3).
    Calling `read(dt_hours)` returns the next AirQualityReading payload.
    """
    building_id: str
    room_id: str
    scenario: Scenario
    _env:   EnvironmentModel  = field(init=False)
    _error: SensorErrorModel  = field(init=False)

    def __post_init__(self) -> None:
        self._env   = EnvironmentModel(scenario=self.scenario)
        self._error = SensorErrorModel()

    def read(self, dt_hours: float) -> AirQualityReading:
        """Advance environment, apply physics, apply errors → reading."""
        # Layer 2: evolve the environment
        true_conditions = self._env.advance(dt_hours)

        # Layer 1: compute true physical readings
        true_readings = compute_all(true_conditions)

        # Layer 3: corrupt readings with sensor imperfections
        reported = self._error.apply(true_readings)

        # Clamp reported values to physically plausible ranges
        pm25 = max(0.0, round(reported["pm25"], 2))
        pm10 = max(pm25, round(reported["pm10"], 2))
        co2  = max(350.0, round(reported["co2"], 1))
        voc  = max(0.0, round(reported["voc"], 1))
        temp = round(reported["temperature"], 2)
        hum  = min(100.0, max(0.0, round(reported["humidity"], 1)))
        aqi  = pm25_to_aqi(pm25)

        return AirQualityReading(
            buildingId  = self.building_id,
            roomId      = self.room_id,
            timestamp   = int(time.time() * 1000),
            scenario    = self.scenario.value,
            pm25        = pm25,
            pm10        = pm10,
            co2         = co2,
            voc         = voc,
            temperature = temp,
            humidity    = hum,
            aqi         = aqi,
        )

@dataclass
class SimulationBuilding:
    config: BuildingConfig
    rooms: dict[str, SimulationRoom] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for room_id in self.config.roomIds:
            self.rooms[room_id] = SimulationRoom(
                building_id = self.config.buildingId,
                room_id     = room_id,
                scenario    = self.config.scenario,
            )

    @property
    def building_id(self) -> str:
        return self.config.buildingId

    @property
    def target_url(self) -> str:
        url = self.config.targetUrl.rstrip("/")
        # Docker-internal host remapping (mirrors the TypeScript behaviour)
        url = url.replace("localhost", "host.docker.internal")
        url = url.replace("127.0.0.1", "host.docker.internal")
        return url

    @property
    def interval(self) -> float:
        return self.config.interval_seconds

class Simulator:
    """
    Manages all active buildings and drives the async tick loop.

    Public interface mirrors the TypeScript Simulator class:
      register_building(config) → registers a building
      start(building_id)         → starts the loop for a building
      stop(building_id)          → stops the loop for a building
      get_is_running(id)         → bool
    """

    def __init__(self) -> None:
        self._buildings: dict[str, SimulationBuilding] = {}
        self._tasks:     dict[str, asyncio.Task]       = {}
        self._client:    httpx.AsyncClient | None      = None

    # ------------------------------------------------------------------ #
    #  HTTP client lifecycle                                               #
    # ------------------------------------------------------------------ #

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=8.0)
        return self._client

    async def close(self) -> None:
        """Graceful shutdown — cancel tasks and close the HTTP client."""
        for task in self._tasks.values():
            task.cancel()
        self._tasks.clear()
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def register_building(self, config: BuildingConfig) -> None:
        building = SimulationBuilding(config=config)
        self._buildings[config.buildingId] = building

        task = self._tasks.pop(config.buildingId, None)
        if task:
            task.cancel()

        logger.info(
            "Simulator registered for building=%s rooms=%s scenario=%s interval=%ss",
            config.buildingId,
            config.roomIds,
            config.scenario,
            config.interval_seconds,
        )

    def start(self, building_id: str) -> None:
        """Start simulation for a previously registered building."""
        if building_id not in self._buildings:
            raise ValueError(f"Building '{building_id}' is not registered")

        if building_id in self._tasks:
            return

        building = self._buildings[building_id]
        task = asyncio.create_task(
            self._tick_loop(building),
            name=f"tick-{building.building_id}",
        )
        self._tasks[building_id] = task
        logger.info(
            "Simulator started for building=%s rooms=%s scenario=%s interval=%ss",
            building.config.buildingId,
            building.config.roomIds,
            building.config.scenario,
            building.config.interval_seconds,
        )

    def start_all(self) -> None:
        """Start simulation for all registered buildings."""
        if not self._buildings:
            raise ValueError("No buildings registered for simulation")
        for building_id in list(self._buildings.keys()):
            self.start(building_id)

    def start_or_add(self, config: BuildingConfig) -> None:
        """Register a building and start its tick-loop (legacy helper)."""
        self.register_building(config)
        self.start(config.buildingId)

    def stop(self, building_id: str) -> None:
        """Stop simulation for one building."""
        if building_id not in self._buildings:
            raise ValueError(f"Building '{building_id}' is not registered")
        task = self._tasks.pop(building_id, None)
        if task:
            task.cancel()
        logger.info("Simulator stopped for building=%s", building_id)

    def get_is_running(self, building_id: str) -> bool:
        return building_id in self._tasks

    @property
    def is_any_running(self) -> bool:
        return bool(self._tasks)

    @property
    def active_building_ids(self) -> list[str]:
        return list(self._buildings.keys())

    # ------------------------------------------------------------------ #
    #  Async tick loop                                                     #
    # ------------------------------------------------------------------ #

    async def _tick_loop(self, building: SimulationBuilding) -> None:
        """Fires every `building.interval` seconds for one building."""
        while True:
            try:
                dt_hours = building.interval / 3600.0
                await self._send_signals(building, dt_hours)
            except asyncio.CancelledError:
                return
            except Exception as exc:
                logger.error("Tick error for building=%s: %s", building.building_id, exc)
            await asyncio.sleep(building.interval)

    async def _send_signals(self, building: SimulationBuilding, dt_hours: float) -> None:
        """Generate and POST one reading per room."""
        client = await self._get_client()
        for room in building.rooms.values():
            await self._send_single_signal(client, building, room, dt_hours)

    async def _send_single_signal(
        self,
        client: httpx.AsyncClient,
        building: SimulationBuilding,
        room: SimulationRoom,
        dt_hours: float,
    ) -> None:
        reading = room.read(dt_hours)
        payload = reading.model_dump()
        url     = f"{building.target_url}/air-quality"

        try:
            response = await client.post(url, json=payload)
            if response.is_success:
                logger.debug(
                    "Sent reading building=%s room=%s aqi=%s pm25=%.1f co2=%.0f",
                    room.building_id, room.room_id,
                    reading.aqi, reading.pm25, reading.co2,
                )
            else:
                logger.warning(
                    "[Simulator] POST %s → %s %s",
                    url, response.status_code, response.reason_phrase,
                )
        except httpx.RequestError as exc:
            logger.error(
                "[Simulator] Network error connecting to %s: %s", url, exc
            )
