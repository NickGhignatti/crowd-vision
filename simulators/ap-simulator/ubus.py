"""What an OpenWrt router puts on the wire: ubus JSON-RPC envelopes, station tables, event streams.

Shapes follow hostapd's `ubus.c` and uhttpd's subscription stream, not the collector's parser.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from building import Station

NULL_SESSION = "00000000000000000000000000000000"
UBUS_OK = 0
UBUS_PERMISSION_DENIED = 6
_NOISE_DBM = -95


def envelope(request_id: Any, status: int, payload: dict | None = None) -> dict:
    result: list[Any] = [status] if payload is None else [status, payload]
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def error_envelope(request_id: Any, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": message}}


def hostapd_clients(freq: int, stations: Iterable[Station]) -> dict:
    """`hostapd.<iface> get_clients`: a map keyed by MAC, with no inactive time to tell stale rows."""
    return {"freq": freq, "clients": {s.mac: _hostapd_client(s) for s in stations}}


def iwinfo_assoclist(stations: Iterable[Station]) -> dict:
    """`iwinfo assoclist`: a list, uppercase MACs, and the kernel's inactive time per station."""
    return {
        "results": [
            {
                "mac": s.mac.upper(),
                "signal": s.signal,
                "signal_avg": s.signal,
                "noise": _NOISE_DBM,
                "inactive": s.inactive_ms,
                "connected_time": s.connected_s,
                "rx": {"rate": _rate_kbps(s.signal), "packets": s.rx_packets},
                "tx": {"rate": _rate_kbps(s.signal), "packets": s.tx_packets},
            }
            for s in stations
        ]
    }


def sse(event: str, data: dict) -> str:
    """One notification as uhttpd streams a `/ubus/subscribe/<object>` connection."""
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


def _hostapd_client(s: Station) -> dict:
    rate = _rate_kbps(s.signal)
    return {
        "auth": True,
        "assoc": True,
        "authorized": True,
        "preauth": False,
        "wds": False,
        "wmm": True,
        "ht": True,
        "vht": True,
        "he": False,
        "wps": False,
        "mfp": True,
        "mbo": False,
        "rrm": [0, 0, 0, 0, 0],
        "extended_capabilities": [0, 0, 0, 0, 0, 0, 0, 0],
        "aid": s.aid,
        "bytes": {"rx": s.rx_packets * 600, "tx": s.tx_packets * 300},
        "airtime": {"rx": s.rx_packets * 40, "tx": s.tx_packets * 40},
        "packets": {"rx": s.rx_packets, "tx": s.tx_packets},
        "rate": {"rx": rate, "tx": rate},
        "signal": s.signal,
    }


def _rate_kbps(signal: int) -> int:
    for floor_dbm, kbps in ((-55, 866_700), (-65, 433_300), (-75, 130_000)):
        if signal >= floor_dbm:
            return kbps
    return 6_500
