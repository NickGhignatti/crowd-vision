"""Probe frames grouped into bursts: one scan, under one address, heard by every router in range.

A phone may draw a fresh random address per scan, so an address ties frames together only briefly.
"""

from __future__ import annotations

import time
from itertools import groupby
from typing import TYPE_CHECKING, NamedTuple

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from app.probes import Probe

BURST_WINDOW_S = 2.0
"""Every router in range hears one scan within ~1.5 s; a phone's next scan is far later."""


class Burst(NamedTuple):
    """One scan: its address, when the first router heard it, and each router's loudest frame."""

    address: str
    started: float
    heard: Mapping[str, int]


def group_bursts(
    probes: Iterable[Probe], now: float, window_s: float = BURST_WINDOW_S
) -> tuple[list[Burst], list[Probe]]:
    """Closed bursts, plus the frames of any burst still open at `now`, to retry next tick.

    The window starts at a burst's first frame, so an address that never goes quiet still splits.
    """
    closed: list[Burst] = []
    still_open: list[Probe] = []
    ordered = sorted(probes, key=lambda probe: (probe.address, probe.received))
    for address, frames in groupby(ordered, key=lambda probe: probe.address):
        scan: list[Probe] = []
        for frame in frames:
            if scan and frame.received - scan[0].received > window_s:
                closed.append(_burst(address, scan))
                scan = []
            scan.append(frame)
        if now - scan[0].received < window_s:
            still_open += scan
        else:
            closed.append(_burst(address, scan))
    return closed, still_open


def _burst(address: str, scan: list[Probe]) -> Burst:
    heard: dict[str, int] = {}
    for frame in scan:
        # Walls and bodies only take signal away: the loudest frame is the truest.
        heard[frame.router] = max(frame.signal, heard.get(frame.router, frame.signal))
    return Burst(address, scan[0].received, heard)


class Bursts:
    """Each building's closed bursts per tick; a burst cut by the tick waits for its late frames."""

    def __init__(
        self,
        drain: Callable[[str], list[Probe]],
        clock: Callable[[], float] = time.time,
        window_s: float = BURST_WINDOW_S,
    ) -> None:
        self._drain = drain
        self._clock = clock
        self._window_s = window_s
        self._open: dict[str, list[Probe]] = {}

    def take(self, building: str) -> list[Burst]:
        probes = self._open.pop(building, []) + self._drain(building)
        closed, still_open = group_bursts(probes, self._clock(), self._window_s)
        if still_open:
            self._open[building] = still_open
        return closed
