"""Fake OpenWrt ubus endpoint, one path per simulated AP. Points a real
`ref/collector/app/ubus.py`-shaped client at `http://ap-simulator:3000/<ap_id>/ubus`
instead of real hardware for phases 1-4 of the wireless-flow plan."""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import scenarios
from schemas import StatusResponse
from ubus import NULL_SESSION, UBUS_OK, UBUS_PERMISSION_DENIED, envelope, error_envelope
from world import World

app = FastAPI(title="AP Simulator (fake ubus)")

_preset = os.environ.get("AP_SIM_SCENARIO", "corridor")
world = World(scenarios.PRESETS[_preset]())


@app.post("/{ap_id}/ubus")
async def ubus_rpc(ap_id: str, request: Request) -> JSONResponse:
    body = await request.json()
    request_id = body.get("id", 1)

    if ap_id not in world.aps:
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

    ap = world.aps[ap_id]
    clients = world.clients(ap_id)

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


@app.post("/control/kill/{ap_id}")
def kill(ap_id: str) -> dict:
    world.kill(ap_id)
    return {"down": sorted(world.down)}


@app.post("/control/revive/{ap_id}")
def revive(ap_id: str) -> dict:
    world.revive(ap_id)
    return {"down": sorted(world.down)}


@app.get("/control/status")
def status() -> StatusResponse:
    return StatusResponse(
        aps=sorted(world.aps),
        down=sorted(world.down),
        devices=sorted(world.device_macs),
    )


@app.get("/control/ground-truth")
def ground_truth(mac: str) -> dict:
    return {"mac": mac, "zone": world.ground_truth_zone(mac)}
