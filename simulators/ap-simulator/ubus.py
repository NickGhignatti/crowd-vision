"""Server-side counterpart to the collector's OpenWrt ubus client. Speaks the
same wire format the client parses: `result: [status, payload]`, status 0 is
success, a bare one-element result is an error with no payload."""

from __future__ import annotations

from typing import Any

NULL_SESSION = "00000000000000000000000000000000"
UBUS_OK = 0
UBUS_PERMISSION_DENIED = 6


def envelope(request_id: Any, status: int, payload: dict | None = None) -> dict:
    result: list[Any] = [status] if payload is None else [status, payload]
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def error_envelope(request_id: Any, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32000, "message": message}}
