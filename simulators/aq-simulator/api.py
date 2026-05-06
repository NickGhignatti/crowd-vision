from __future__ import annotations

from fastapi import FastAPI, HTTPException

from signal import BuildingConfig, StatusResponse
from simulator import Simulator

app = FastAPI(title="Air Quality Simulator")
simulator = Simulator()


@app.post("/control/building")
async def register_building(config: BuildingConfig) -> dict:
    try:
        simulator.start_or_add(config)
        return {"message": f"Building registered and started for {config.buildingId}"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/control/status")
async def status(buildingId: str | None = None) -> StatusResponse:
    if buildingId:
        return StatusResponse(
            isRunning=simulator.get_is_running(buildingId),
            activeBuildings=simulator.active_building_ids,
        )
    return StatusResponse(
        isRunning=simulator.is_any_running,
        activeBuildings=simulator.active_building_ids,
    )
