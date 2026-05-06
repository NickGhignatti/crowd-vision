from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import BuildingConfig, StopRequest, StatusResponse
from simulator import Simulator

app = FastAPI(title="Air Quality Simulator")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

simulator = Simulator()


@app.post("/control/start")
async def start_simulation(config: BuildingConfig) -> dict:
    try:
        simulator.start_or_add(config)
        return {"message": f"Simulator started for {config.buildingId}"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/control/stop")
async def stop_simulation(request: StopRequest) -> dict:
    try:
        simulator.stop(request.buildingId)
        return {"message": f"Simulator stopped for {request.buildingId}"}
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
