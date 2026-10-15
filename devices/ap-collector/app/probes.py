"""hostapd's probe notifications, streamed from every router over uhttpd's ubus subscription.

The only source that hears one phone at several routers: `get_clients` lists just a router's own.
"""

from __future__ import annotations

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from typing import TYPE_CHECKING, NamedTuple, Protocol

from app.ubus import UbusError, login

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Iterator

    from app.config import AccessPoint, Building

STREAM_TIMEOUT_S = 30.0
"""A stream quiet this long is reopened: a router that died mid-stream never says so."""
LOGIN_TIMEOUT_S = 10
MAX_BACKOFF_S = 60.0
BUFFER_LIMIT = 20_000


class Probe(NamedTuple):
    """One probe frame one router heard: from which address, how loud, when it arrived here."""

    router: str
    address: str
    signal: int
    received: float


def parse_events(lines: Iterable[str]) -> Iterator[tuple[str, str]]:
    """(event, data) per server-sent event; one still missing its closing blank line is held back."""
    event, data = "message", []
    for raw in lines:
        line = raw.rstrip("\r\n")
        if not line:
            if data:
                yield event, "\n".join(data)
            event, data = "message", []
        elif line.startswith("event:"):
            event = line.removeprefix("event:").strip()
        elif line.startswith("data:"):
            data.append(line.removeprefix("data:").removeprefix(" "))


def probe_from(router: str, event: str, data: str, received: float) -> Probe | None:
    """The probe one event carries; auth, assoc and anything malformed carry none."""
    if event != "probe":
        return None
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    address, signal = payload.get("address"), payload.get("signal")
    if not isinstance(address, str) or not isinstance(signal, int) or isinstance(signal, bool):
        return None
    return Probe(router, address.lower(), signal, received)


class ProbeBuffer:
    """Listener threads add, the tick drains; once full it forgets the oldest probe first."""

    def __init__(self, limit: int = BUFFER_LIMIT) -> None:
        self._probes: deque[Probe] = deque(maxlen=limit)
        self._lock = threading.Lock()

    def add(self, probe: Probe) -> None:
        with self._lock:
            self._probes.append(probe)

    def drain(self) -> list[Probe]:
        with self._lock:
            probes = list(self._probes)
            self._probes.clear()
        return probes


class ProbeListener:
    """One router's subscriptions, a thread per interface, reopened until stopped."""

    def __init__(
        self,
        ap: AccessPoint,
        buffer: ProbeBuffer,
        *,
        clock: Callable[[], float] = time.time,
        backoff_s: float = 1.0,
    ) -> None:
        self.ap = ap
        self._buffer = buffer
        self._clock = clock
        self._backoff_s = backoff_s
        self._token: str | None = None
        self._token_lock = threading.Lock()
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    @property
    def running(self) -> bool:
        return any(thread.is_alive() for thread in self._threads)

    def start(self) -> None:
        self._threads = [
            threading.Thread(
                target=self._keep_listening,
                args=(iface,),
                name=f"probes-{self.ap.name}-{iface}",
                daemon=True,
            )
            for iface in self.ap.ifaces
        ]
        for thread in self._threads:
            thread.start()

    def stop(self) -> None:
        """Asks every thread to end; one blocked in a read ends within `STREAM_TIMEOUT_S`."""
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout=0.1)

    def listen_once(self, iface: str) -> None:
        """Holds one subscription open until the router ends it or goes quiet."""
        request = urllib.request.Request(  # noqa: S310
            f"{self.ap.url.rstrip('/')}/subscribe/hostapd.{iface}",
            headers={"Authorization": f"Bearer {self._session()}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=STREAM_TIMEOUT_S) as stream:  # noqa: S310
                lines = (raw.decode("utf-8", "replace") for raw in stream)
                for event, data in parse_events(lines):
                    probe = probe_from(self.ap.name, event, data, self._clock())
                    if probe is not None:
                        self._buffer.add(probe)
                    if self._stop.is_set():
                        return
        except urllib.error.HTTPError as error:
            if error.code == 403:
                # rpcd expired the session; the next attempt logs in again.
                with self._token_lock:
                    self._token = None
            raise UbusError(f"{request.full_url} returned {error.code}") from error
        except TimeoutError:
            return
        except (urllib.error.URLError, OSError) as error:
            raise UbusError(f"{request.full_url} unreachable: {error}") from error

    def _session(self) -> str:
        with self._token_lock:
            if self._token is None:
                self._token = login(
                    self.ap.url, self.ap.username, self.ap.password, LOGIN_TIMEOUT_S
                )
            return self._token

    def _keep_listening(self, iface: str) -> None:
        backoff, last_error = self._backoff_s, ""
        while not self._stop.is_set():
            try:
                self.listen_once(iface)
                backoff, last_error = self._backoff_s, ""
            except UbusError as error:
                # Said once per new failure, not on every retry of the same one.
                if str(error) != last_error:
                    last_error = str(error)
                    print(f"router {self.ap.name}: no probes on {iface}: {error}", file=sys.stderr)
                backoff = min(backoff * 2, MAX_BACKOFF_S)
            self._stop.wait(backoff)


class Listener(Protocol):
    ap: AccessPoint

    def start(self) -> None: ...

    def stop(self) -> None: ...


class ProbeHub:
    """A listener per router, kept in step with the router list, and one buffer per building."""

    def __init__(self, make: Callable[[AccessPoint, ProbeBuffer], Listener]) -> None:
        self._make = make
        self._buffers: dict[str, ProbeBuffer] = {}
        self._listeners: dict[tuple[str, str], Listener] = {}

    def sync(self, buildings: Iterable[Building]) -> None:
        """Starts new routers, restarts changed ones, stops the gone; an unchanged one keeps its stream."""
        wanted = {(b.name, ap.name): ap for b in buildings for ap in b.ap}
        for key, listener in list(self._listeners.items()):
            if key not in wanted or not _same_stream(listener.ap, wanted[key]):
                self._listeners.pop(key).stop()
        for (building, name), ap in wanted.items():
            if (building, name) not in self._listeners:
                listener = self._make(ap, self._buffers.setdefault(building, ProbeBuffer()))
                listener.start()
                self._listeners[(building, name)] = listener
        for building in set(self._buffers) - {building for building, _ in wanted}:
            del self._buffers[building]

    def drain(self, building: str) -> list[Probe]:
        buffer = self._buffers.get(building)
        return buffer.drain() if buffer is not None else []

    def stop(self) -> None:
        for listener in self._listeners.values():
            listener.stop()
        self._listeners.clear()


def _same_stream(a: AccessPoint, b: AccessPoint) -> bool:
    fields = ("url", "username", "password")
    same_login = all(getattr(a, f) == getattr(b, f) for f in fields)
    return same_login and tuple(a.ifaces) == tuple(b.ifaces)
