"""Fake OpenWrt routers, one per router sensor telemetry starts: ubus at `/<sensorId>/ubus`.

`/control/*` is telemetry's; `/debug/*` breaks routers and serves ground truth.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from building import IFACE, ROUTER, BuildingWorld, simulate
from config import SimConfig
from schemas import BuildingStart, BuildingStatus, StopRequest
from twin import TwinError, fetch_geometry
from ubus import (
    NULL_SESSION,
    UBUS_OK,
    UBUS_PERMISSION_DENIED,
    envelope,
    error_envelope,
    hostapd_clients,
    iwinfo_assoclist,
    sse,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="AP Simulator (fake OpenWrt routers)")

CONFIG = SimConfig.from_env(os.environ)
TWIN_URL = os.environ.get("DIGITAL_TWIN_URL", "http://digital-twin:3000")
HOSTAPD = f"hostapd.{IFACE}"
buildings: dict[str, BuildingWorld] = {}


def _world_of(ap_id: str) -> BuildingWorld | None:
    return next((w for w in buildings.values() if ap_id in w.aps), None)


def _ap_world(ap_id: str) -> BuildingWorld:
    found = _world_of(ap_id)
    if found is None:
        raise HTTPException(status_code=404, detail=f"unknown AP '{ap_id}'")
    return found


@app.post("/{ap_id}/ubus")
async def ubus_rpc(ap_id: str, request: Request) -> JSONResponse:
    body = await request.json()
    request_id = body.get("id", 1)

    world = _world_of(ap_id)
    if world is None:
        return JSONResponse(error_envelope(request_id, f"unknown AP '{ap_id}'"), status_code=404)
    if world.is_down(ap_id):
        return JSONResponse(
            error_envelope(request_id, "AP unreachable (simulated)"), status_code=503
        )

    params = body.get("params") or []
    if len(params) != 4:
        return JSONResponse(error_envelope(request_id, "malformed ubus call"), status_code=400)
    session_id, obj, method, call_params = params

    if obj == "session" and method == "login":
        token = world.login(ap_id, call_params.get("username", ""), call_params.get("password", ""))
        if token is None:
            return JSONResponse(envelope(request_id, UBUS_PERMISSION_DENIED))
        return JSONResponse(envelope(request_id, UBUS_OK, {"ubus_rpc_session": token}))

    if session_id == NULL_SESSION or not world.check_session(ap_id, session_id):
        return JSONResponse(envelope(request_id, UBUS_PERMISSION_DENIED))

    if obj == HOSTAPD and method == "get_clients":
        stations = world.clients(ap_id, time.time())
        return JSONResponse(
            envelope(request_id, UBUS_OK, hostapd_clients(world.freq(ap_id), stations))
        )

    if obj == "iwinfo" and method == "assoclist" and call_params.get("device") == IFACE:
        stations = world.clients(ap_id, time.time())
        return JSONResponse(envelope(request_id, UBUS_OK, iwinfo_assoclist(stations)))

    return JSONResponse(error_envelope(request_id, f"no such object/method on {ap_id}"))


@app.get("/{ap_id}/ubus/subscribe/{obj}")
async def subscribe(ap_id: str, obj: str, request: Request) -> StreamingResponse:
    """uhttpd's subscription: a bearer session, the `:subscribe` grant, then hostapd's events."""
    world = _ap_world(ap_id)
    if world.is_down(ap_id):
        raise HTTPException(status_code=503, detail="AP unreachable (simulated)")
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not world.check_session(ap_id, token):
        raise HTTPException(status_code=403, detail="Access denied")
    if obj != HOSTAPD:
        raise HTTPException(status_code=404, detail=f"no object '{obj}' on {ap_id}")

    def alive() -> bool:
        return buildings.get(world.building_id) is world

    return StreamingResponse(
        probe_stream(world, ap_id, alive=alive), media_type="text/event-stream"
    )


async def probe_stream(
    world: BuildingWorld,
    ap_id: str,
    *,
    now: Callable[[], float] = time.time,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    alive: Callable[[], bool] = lambda: True,
    interval_s: float = 0.5,
) -> AsyncIterator[str]:
    """One router's hostapd notifications as server-sent events; ends when the router goes away."""
    last = now()
    while alive() and not world.is_down(ap_id):
        await sleep(interval_s)
        current = now()
        for event in world.events(ap_id, last, current):
            yield sse(event.kind, event.payload)
        last = current


@app.post("/control/start")
def start(body: BuildingStart) -> dict:
    """Replaces what the building simulates; no router means stop simulating it."""
    routers = [(s.sensorId, s.roomId) for s in body.sensors if s.sensorType == ROUTER]
    if not routers:
        return stop(StopRequest(buildingId=body.buildingId))
    try:
        rooms, placements = fetch_geometry(TWIN_URL, body.buildingId)
    except TwinError as error:
        raise HTTPException(status_code=502, detail=f"digital-twin: {error}") from error
    world = simulate(body.buildingId, rooms, routers, placements, CONFIG)
    if world is None:
        return stop(StopRequest(buildingId=body.buildingId))
    buildings[body.buildingId] = world
    safe_building_id = body.buildingId.replace("\r", "").replace("\n", "")
    logger.info(
        "building=%r aps=%d phones=%d placed=%s",
        safe_building_id,
        len(world.aps),
        len(world.device_macs),
        placements is not None,
    )
    return {"message": f"Simulator started for {body.buildingId}"}


@app.post("/control/stop")
def stop(body: StopRequest) -> dict:
    """Stops one building; one it never simulated is already stopped."""
    buildings.pop(body.buildingId, None)
    return {"message": f"Simulator stopped for {body.buildingId}"}


@app.get("/control/status")
def building_status(buildingId: str | None = None) -> BuildingStatus:
    running = buildingId in buildings if buildingId else bool(buildings)
    return BuildingStatus(isRunning=running, activeBuildings=sorted(buildings))


@app.post("/debug/kill/{ap_id}")
def kill(ap_id: str) -> dict:
    world = _ap_world(ap_id)
    world.kill(ap_id)
    return {"down": sorted(world.down)}


@app.post("/debug/revive/{ap_id}")
def revive(ap_id: str) -> dict:
    world = _ap_world(ap_id)
    world.revive(ap_id)
    return {"down": sorted(world.down)}


@app.get("/debug/ground-truth")
def ground_truth(buildingId: str) -> dict:
    """Where every phone really is and who sent each recent burst: what an estimator is scored on."""
    world = buildings.get(buildingId)
    if world is None:
        raise HTTPException(status_code=404, detail=f"building '{buildingId}' is not simulated")
    return world.ground_truth(time.time())
