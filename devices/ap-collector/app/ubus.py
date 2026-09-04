from __future__ import annotations

import enum
import json
import urllib.error
import urllib.request
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from app.config import AccessPoint


class StationsSource(Protocol):
    """Anything with a `.stations()` -- what `poll_one`/`poll_aps`/etc. actually need.

    `ApSession` satisfies this structurally, so does a test double with no real network
    behind it: the collector's tick machinery never needs to know or care which."""

    def stations(self) -> list[tuple[str, int]]: ...


NULL_SESSION: str = "0" * 32


class UbusState(enum.Enum):
    UBUS_STATUS_OK = 0
    UBUS_STATUS_INVALID_ARGUMENT = 1
    UBUS_STATUS_METHOD_NOT_FOUND = 2
    UBUS_STATUS_VERSION_MISMATCH = 3
    UBUS_STATUS_UNKNOWN_ERROR = 4
    UBUS_STATUS_CONNECTION_FAILED = 5
    UBUS_STATUS_PERMISSION_DENIED = 6
    UBUS_STATUS_TIMEOUT = 7
    UBUS_STATUS_NO_DATA = 8
    UBUS_STATUS_ILLEGAL_STATE = 9


class UbusError(RuntimeError):
    """Transport-level failure: the AP never answered, or answered nonsense."""


class UbusStatusError(UbusError):
    """The AP answered, but ubus itself reported a non-OK status."""

    def __init__(self, status: UbusState, detail: str = "") -> None:
        super().__init__(f"ubus status {status.name}{f': {detail}' if detail else ''}")
        self.status = status


def _rpc(url: str, timeout: int, params: list[Any]) -> dict[str, Any]:
    """POST one ubus call, return its payload dict, raise on any failure.

    Every ubus-over-HTTP response wraps its result as `result: [status, payload]` --
    a bare one-element list on failure, carrying no payload at all.
    """
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": params}).encode()
    request = urllib.request.Request(  # noqa: S310
        url,
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            parsed = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise UbusError(f"{url} unreachable: {error}") from error

    if "error" in parsed:
        raise UbusError(f"{url} returned a JSON-RPC error: {parsed['error']}")

    result = parsed.get("result")
    if not isinstance(result, list) or not result:
        raise UbusError(f"{url} returned an unexpected envelope: {parsed!r}")

    try:
        status = UbusState(result[0])
    except ValueError as error:
        raise UbusError(f"{url} returned unknown ubus status {result[0]!r}") from error

    if status != UbusState.UBUS_STATUS_OK:
        raise UbusStatusError(status)
    return result[1] if len(result) > 1 and isinstance(result[1], dict) else {}


def login(url: str, username: str, password: str, timeout: int) -> str:
    payload = _rpc(
        url,
        timeout,
        [NULL_SESSION, "session", "login", {"username": username, "password": password}],
    )
    token = payload.get("ubus_rpc_session")
    if not isinstance(token, str) or not token:
        raise UbusError(f"{url} login returned no session token")
    return token


def stations_hostapd(url: str, token: str, iface: str, timeout: int) -> list[tuple[str, int]]:
    """`hostapd.<iface> get_clients` -- a map keyed by MAC, each value carrying `signal` in dBm."""
    payload = _rpc(url, timeout, [token, f"hostapd.{iface}", "get_clients", {}])
    clients = payload.get("clients")
    if not isinstance(clients, dict):
        raise UbusError(f"hostapd.{iface} get_clients returned no clients map: {payload!r}")
    return [
        (mac.lower(), info["signal"])
        for mac, info in clients.items()
        if isinstance(info, dict) and isinstance(info.get("signal"), int)
    ]


def stations_iwinfo(url: str, token: str, device: str, timeout: int) -> list[tuple[str, int]]:
    """`iwinfo assoclist` -- a *list* under `results`, not a map. Different ACL, different shape."""
    payload = _rpc(url, timeout, [token, "iwinfo", "assoclist", {"device": device}])
    results = payload.get("results")
    if not isinstance(results, list):
        raise UbusError(f"iwinfo assoclist {device} returned no results list: {payload!r}")
    return [
        (row["mac"].lower(), row["signal"])
        for row in results
        if isinstance(row, dict)
        and isinstance(row.get("mac"), str)
        and isinstance(row.get("signal"), int)
    ]


class ApSession:
    """One AP's session, re-established on demand.

    rpcd expires a session after inactivity, and an expired token is reported as
    permission-denied rather than as an authentication failure -- retrying once on
    that status is the difference between a collector that survives the night and
    one that raises on the first expiry.
    """

    def __init__(self, ap: AccessPoint, timeout: int) -> None:
        self.ap = ap
        self.timeout = timeout
        self._token: str | None = None

    def stations(self) -> list[tuple[str, int]]:
        for attempt in (1, 2):
            try:
                return self._read(self._session())
            except UbusStatusError as error:
                if attempt == 2 or error.status != UbusState.UBUS_STATUS_PERMISSION_DENIED:
                    raise
                self._token = None
        raise AssertionError("unreachable")

    def _session(self) -> str:
        if self._token is None:
            self._token = login(self.ap.url, self.ap.username, self.ap.password, self.timeout)
        return self._token

    def _read(self, token: str) -> list[tuple[str, int]]:
        read = stations_hostapd if self.ap.reader == "hostapd" else stations_iwinfo
        stations: list[tuple[str, int]] = []
        for iface in self.ap.ifaces:
            stations += read(self.ap.url, token, iface, self.timeout)
        return stations
