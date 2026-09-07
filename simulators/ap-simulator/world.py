"""Live state for every simulated AP and device.

Device positions are pure functions of wall-clock time — nothing is ticked or
mutated per-request — so a server restart or a second concurrent reader stays
consistent with the first."""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass

from physics import rssi_dbm
from schemas import ApConfig, DeviceRoute, ScenarioConfig


@dataclass
class _Segment:
    start_x: float
    start_y: float
    end_x: float
    end_y: float
    hold_s: float
    travel_s: float

    @property
    def duration_s(self) -> float:
        return self.hold_s + self.travel_s


def _route_segments(route: DeviceRoute) -> list[_Segment]:
    points = route.waypoints
    segments: list[_Segment] = []
    for i, wp in enumerate(points):
        nxt = points[(i + 1) % len(points)]
        dist = math.hypot(nxt.x - wp.x, nxt.y - wp.y)
        travel_s = dist / route.speed_mps if route.speed_mps > 0 else 0.0
        segments.append(_Segment(wp.x, wp.y, nxt.x, nxt.y, wp.hold_s, travel_s))
    return segments


@dataclass
class _Device:
    mac: str
    segments: list[_Segment]
    cycle_s: float
    start_offset_s: float

    def position_at(self, now_s: float) -> tuple[float, float]:
        t = (now_s - self.start_offset_s) % self.cycle_s
        for seg in self.segments:
            if t < seg.hold_s:
                return seg.start_x, seg.start_y
            t -= seg.hold_s
            if t < seg.travel_s:
                frac = t / seg.travel_s if seg.travel_s > 0 else 1.0
                return (
                    seg.start_x + (seg.end_x - seg.start_x) * frac,
                    seg.start_y + (seg.end_y - seg.start_y) * frac,
                )
            t -= seg.travel_s
        last = self.segments[-1]
        return last.end_x, last.end_y


@dataclass
class _ApSession:
    token: str
    expires_at: float


class World:
    def __init__(self, config: ScenarioConfig, seed: int | None = None) -> None:
        self.config = config
        self.aps: dict[str, ApConfig] = {ap.id: ap for ap in config.aps}
        self._devices = [self._build_device(d) for d in config.devices]
        self._sessions: dict[str, _ApSession] = {}
        self._down: set[str] = set()
        self._rng = random.Random(seed)

    @staticmethod
    def _build_device(route: DeviceRoute) -> _Device:
        segments = _route_segments(route)
        cycle_s = sum(seg.duration_s for seg in segments) or 1.0
        return _Device(route.mac, segments, cycle_s, route.phase_offset_s)

    @property
    def device_macs(self) -> list[str]:
        return [d.mac for d in self._devices]

    @property
    def down(self) -> set[str]:
        return set(self._down)

    def kill(self, ap_id: str) -> None:
        self._down.add(ap_id)

    def revive(self, ap_id: str) -> None:
        self._down.discard(ap_id)

    def is_down(self, ap_id: str) -> bool:
        return ap_id in self._down

    def login(self, ap_id: str, username: str, password: str) -> str | None:
        ap = self.aps[ap_id]
        if username != ap.username or password != ap.password:
            return None
        token = f"tok-{ap_id}-{self._rng.randrange(10**9)}"
        self._sessions[ap_id] = _ApSession(token, time.monotonic() + ap.session_ttl_s)
        return token

    def check_session(self, ap_id: str, token: str) -> bool:
        session = self._sessions.get(ap_id)
        return (
            session is not None
            and session.token == token
            and time.monotonic() < session.expires_at
        )

    def clients(self, ap_id: str) -> list[tuple[str, int]]:
        """(mac, rssi) for every device currently within earshot of this AP."""
        ap = self.aps[ap_id]
        now = time.time()
        out: list[tuple[str, int]] = []
        for device in self._devices:
            x, y = device.position_at(now)
            distance = math.hypot(x - ap.x, y - ap.y)
            signal = rssi_dbm(distance, self.config.tx_power_dbm, self.config.path_loss_exponent)
            signal += self._rng.gauss(0, self.config.noise_stddev_db)
            if signal >= self.config.sensitivity_dbm:
                out.append((device.mac, round(signal)))
        return out

    def ground_truth_zone(self, mac: str, now_s: float | None = None) -> str | None:
        """Nearest AP's zone id — handy for writing notes/ground-truth.csv
        without hand-timing a real walk."""
        now = now_s if now_s is not None else time.time()
        device = next((d for d in self._devices if d.mac == mac), None)
        if device is None:
            return None
        x, y = device.position_at(now)
        nearest = min(self.aps.values(), key=lambda ap: math.hypot(x - ap.x, y - ap.y))
        return nearest.zone_id
