"""Fake OpenWrt ubus endpoint, one path per simulated AP: `/<ap_id>/ubus`.

`/control/*` is telemetry's: each started building serves one AP per router, id = sensorId.
The preset topology keeps serving the static collector config; `/debug/*` inspects it.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

import scenarios
from building import simulate
from schemas import (
    BuildingStart,
    BuildingStatus,
    ScenarioRequest,
    StatusResponse,
    StopRequest,
)
from ubus import NULL_SESSION, UBUS_OK, UBUS_PERMISSION_DENIED, envelope, error_envelope
from world import World

logger = logging.getLogger(__name__)

app = FastAPI(title="AP Simulator (fake ubus)")

PHONES_PER_ROOM = int(os.environ.get("AP_SIM_PHONES_PER_ROOM", "4"))

_scenario_name = os.environ.get("AP_SIM_SCENARIO", "corridor")
world = World(scenarios.PRESETS[_scenario_name]())
buildings: dict[str, World] = {}


def _world_of(ap_id: str) -> World | None:
    return next((w for w in (*buildings.values(), world) if ap_id in w.aps), None)


@app.post("/{ap_id}/ubus")
async def ubus_rpc(ap_id: str, request: Request) -> JSONResponse:
    body = await request.json()
    request_id = body.get("id", 1)

    ap_world = _world_of(ap_id)
    if ap_world is None:
        return JSONResponse(error_envelope(request_id, f"unknown AP '{ap_id}'"), status_code=404)
    if ap_world.is_down(ap_id):
        return JSONResponse(
            error_envelope(request_id, "AP unreachable (simulated)"), status_code=503
        )

    params = body.get("params") or []
    if len(params) != 4:
        return JSONResponse(error_envelope(request_id, "malformed ubus call"), status_code=400)
    session_id, obj, method, call_params = params

    if obj == "session" and method == "login":
        token = ap_world.login(
            ap_id, call_params.get("username", ""), call_params.get("password", "")
        )
        if token is None:
            return JSONResponse(envelope(request_id, UBUS_PERMISSION_DENIED))
        return JSONResponse(envelope(request_id, UBUS_OK, {"ubus_rpc_session": token}))

    if session_id == NULL_SESSION or not ap_world.check_session(ap_id, session_id):
        return JSONResponse(envelope(request_id, UBUS_PERMISSION_DENIED))

    ap = ap_world.aps[ap_id]
    clients = ap_world.clients(ap_id)

    if obj == f"hostapd.{ap.iface}" and method == "get_clients" and ap.reader == "hostapd":
        payload = {"clients": {mac: {"signal": rssi} for mac, rssi in clients}}
        return JSONResponse(envelope(request_id, UBUS_OK, payload))

    if (
        obj == "iwinfo"
        and method == "assoclist"
        and ap.reader == "iwinfo"
        and call_params.get("device") == ap.device
    ):
        payload = {"results": [{"mac": mac, "signal": rssi} for mac, rssi in clients]}
        return JSONResponse(envelope(request_id, UBUS_OK, payload))

    # Wrong object/method for this AP's granted ACL — mirrors the real rpcd
    # trap where hostapd and iwinfo are gated separately.
    return JSONResponse(error_envelope(request_id, f"no such object/method on {ap_id}"))


@app.post("/control/start")
def start(body: BuildingStart) -> dict:
    """Replaces what the building simulates; no router means stop simulating it."""
    simulated = simulate(body, PHONES_PER_ROOM)
    if simulated is None:
        return stop(StopRequest(buildingId=body.buildingId))
    buildings[body.buildingId] = simulated
    logger.info(
        "building=%r aps=%d phones=%d",
        body.buildingId,
        len(simulated.aps),
        len(simulated.device_macs),
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


def _ap_world(ap_id: str) -> World:
    found = _world_of(ap_id)
    if found is None:
        raise HTTPException(status_code=404, detail=f"unknown AP '{ap_id}'")
    return found


@app.post("/debug/kill/{ap_id}")
def kill(ap_id: str) -> dict:
    ap_world = _ap_world(ap_id)
    ap_world.kill(ap_id)
    return {"down": sorted(ap_world.down)}


@app.post("/debug/revive/{ap_id}")
def revive(ap_id: str) -> dict:
    ap_world = _ap_world(ap_id)
    ap_world.revive(ap_id)
    return {"down": sorted(ap_world.down)}


@app.get("/debug/status")
def status() -> StatusResponse:
    return StatusResponse(
        scenario=_scenario_name,
        aps=sorted(world.aps),
        down=sorted(world.down),
        devices=sorted(world.device_macs),
    )


@app.post("/debug/scenario")
def set_scenario(req: ScenarioRequest) -> StatusResponse:
    """Swap topology/devices at runtime — no restart, but resets all sessions
    and killed-AP state since it's a fresh World."""
    global world, _scenario_name
    if req.preset is not None:
        if req.preset not in scenarios.PRESETS:
            raise HTTPException(status_code=400, detail=f"unknown preset '{req.preset}'")
        world = World(scenarios.PRESETS[req.preset]())
        _scenario_name = req.preset
    else:
        # ScenarioRequest's validator rejects a body with neither field, which is the
        # cross-field invariant a type checker cannot see from the annotations alone.
        assert req.config is not None
        world = World(req.config)
        _scenario_name = "custom"
    return status()


@app.get("/debug/ground-truth")
def ground_truth(mac: str) -> dict:
    return {"mac": mac, "zone": world.ground_truth_zone(mac)}
