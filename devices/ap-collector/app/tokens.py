"""Random stand-ins for device addresses, so no MAC ever leaves the building.

Minted, never derived: no key or hash exists that could turn a token back into its address.
"""

from __future__ import annotations

import secrets
from typing import TYPE_CHECKING, NamedTuple

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from app.bursts import Burst
    from app.collector import Reading

DEFAULT_FORGET_AFTER_TICKS = 3


class Sighting(NamedTuple):
    """A connected phone, as one router lists it."""

    token: str
    router: str
    signal: int


class Scan(NamedTuple):
    """One burst, its address swapped for a token."""

    token: str
    started: float
    heard: Mapping[str, int]


def _mint() -> str:
    return secrets.token_hex(8)


class Tokens:
    """One building's table: a connected phone keeps its token while it stays, a burst gets its own."""

    def __init__(
        self,
        forget_after_ticks: int = DEFAULT_FORGET_AFTER_TICKS,
        mint: Callable[[], str] = _mint,
    ) -> None:
        self._forget_after = forget_after_ticks
        self._mint = mint
        self._known: dict[str, tuple[str, int]] = {}
        self._tick = 0

    def observe(
        self, rows: Iterable[Reading], bursts: Iterable[Burst]
    ) -> tuple[list[Sighting], list[Scan]]:
        """One tick's rows and bursts, every address replaced; call once per tick."""
        self._tick += 1
        sightings = [Sighting(self._connected(mac), router, signal) for router, mac, signal in rows]
        # A few ticks of grace: one failed poll must not split a phone into two strangers.
        self._known = {
            mac: (token, seen)
            for mac, (token, seen) in self._known.items()
            if self._tick - seen < self._forget_after
        }
        scans = [
            Scan(self._of_burst(burst.address), burst.started, burst.heard) for burst in bursts
        ]
        return sightings, scans

    def _of_burst(self, address: str) -> str:
        known = self._known.get(address)
        return known[0] if known is not None else self._mint()

    def _connected(self, mac: str) -> str:
        token = self._known[mac][0] if mac in self._known else self._mint()
        self._known[mac] = (token, self._tick)
        return token
