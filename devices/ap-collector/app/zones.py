"""Resolve associated stations to zones, and hold a zone stable against boundary flapping.

The identifier never leaves this module's caller: a MAC enters, a zone count leaves.
Storing a sequence of positions per device would make the data personal under GDPR
however it is hashed, so the collector only ever emits aggregates.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

Reading = tuple[str, str, int]
"""One station as one AP heard it: (ap, mac, rssi_dbm)."""

_SILENCE = -10_000
"""Below any real dBm reading, so an absent zone always loses a comparison."""

DEFAULT_FROZEN_POLLS = 30
"""How long a device may stay frozen behind a silent AP before it is dropped anyway.

Not a site-tuned number like the hysteresis pair -- a staleness ceiling. Freezing exists to
survive an AP reboot, which is a couple of polls; at the default 60s interval this allows
half an hour of one before conceding the AP is not coming back.
"""


def best_by_zone(
    readings: Iterable[Reading], ap_zones: Mapping[str, str]
) -> dict[str, dict[str, int]]:
    """MAC -> zone -> the strongest RSSI heard anywhere in that zone this tick.

    Union by MAC, never sum per-AP client lists: a device in range of three APs appears in
    three lists, and summing multiplies the count by three -- which looks exactly like the
    MAC-randomization bug people expect, so it gets misdiagnosed.

    Readings from an AP with no zone are dropped rather than raising: a guest radio appearing
    mid-shift must not take the collector down.
    """
    best: dict[str, dict[str, int]] = {}
    for ap, mac, rssi in readings:
        zone = ap_zones.get(ap)
        if zone is None:
            continue
        per_zone = best.setdefault(mac, {})
        if rssi > per_zone.get(zone, _SILENCE):
            per_zone[zone] = rssi
    return best


def strongest_zone(per_zone: Mapping[str, int]) -> str:
    """Loudest zone. Ties break on zone name, so the answer never depends on dict order."""
    return max(per_zone, key=lambda zone: (per_zone[zone], zone))


@dataclass
class _Track:
    zone: str
    candidate: str | None = None
    candidate_polls: int = 0
    missed_polls: int = 0
    frozen_polls: int = 0
    """Counted apart from `missed_polls`: a poll spent behind a silent AP proves nothing
    about the device, so it must not push it towards an absence it never demonstrated."""


class ZoneTracker:
    """Confirmed zone per device, with hysteresis and tolerance for a silent AP.

    A device sitting on a zone boundary flips between two APs every poll. Emitted raw, that
    is phantom lobby -> hall -> lobby traffic at the poll rate -- and since transitions are
    the headline metric, the flapping lands straight in the product.

    A challenger zone must beat the incumbent by `margin_db` *and* hold it for `polls`
    consecutive polls before the device moves. Both numbers are measured in phase 3 and live
    in config, never here: they are site-specific.
    """

    def __init__(
        self,
        polls: int,
        margin_db: float,
        absent_polls: int,
        frozen_polls: int = DEFAULT_FROZEN_POLLS,
    ) -> None:
        if polls < 1:
            raise ValueError("polls must be at least 1")
        if margin_db < 0:
            raise ValueError("margin_db must not be negative")
        if absent_polls < 1:
            raise ValueError("absent_polls must be at least 1")
        if frozen_polls < 1:
            raise ValueError("frozen_polls must be at least 1")
        if frozen_polls < absent_polls:
            # Otherwise a silent AP expires a device sooner than a working one does, which
            # inverts the whole point of freezing.
            raise ValueError("frozen_polls must not be below absent_polls")
        self.polls = polls
        self.margin_db = margin_db
        self.absent_polls = absent_polls
        self.frozen_polls = frozen_polls
        self._tracks: dict[str, _Track] = {}

    def update(
        self, observed: Mapping[str, Mapping[str, int]], available_zones: Iterable[str]
    ) -> tuple[dict[str, str], Counter[tuple[str, str]]]:
        """One tick. Returns the confirmed zone per device and the edges crossed this tick.

        `observed` is `best_by_zone`'s output for the APs that answered. `available_zones` is
        every zone with at least one AP that answered -- a zone is available if *any* of its
        APs replied, since one radio is enough to hear the room.
        """
        available = set(available_zones)
        moves: Counter[tuple[str, str]] = Counter()

        for mac, per_zone in observed.items():
            track = self._tracks.get(mac)
            if track is None:
                # An arrival is not a transition: nobody crossed an interior edge.
                self._tracks[mac] = _Track(zone=strongest_zone(per_zone))
                continue
            track.missed_polls = track.frozen_polls = 0
            moved = self._settle(track, per_zone, available)
            if moved is not None:
                moves[moved] += 1

        self._expire(observed, available)
        return {mac: track.zone for mac, track in self._tracks.items()}, moves

    # "does this device's confirmed zone change?"
    def _settle(
        self, track: _Track, per_zone: Mapping[str, int], available: set[str]
    ) -> tuple[str, str] | None:
        if track.zone not in available:
            # The incumbent's AP did not answer. A neighbour hearing the device is not
            # evidence that it moved, and treating it as such turns one AP reboot into a
            # mass phantom exodus into every adjacent zone at once.
            track.candidate, track.candidate_polls = None, 0
            return None

        challenger = strongest_zone(per_zone)
        if challenger == track.zone:
            track.candidate, track.candidate_polls = None, 0
            return None

        incumbent = per_zone.get(track.zone, _SILENCE)
        if per_zone[challenger] < incumbent + self.margin_db:
            track.candidate, track.candidate_polls = None, 0
            return None

        if track.candidate == challenger:
            track.candidate_polls += 1
        else:
            track.candidate, track.candidate_polls = challenger, 1

        if track.candidate_polls < self.polls:
            return None

        moved = (track.zone, challenger)
        track.zone = challenger
        track.candidate, track.candidate_polls = None, 0
        return moved

    # "which known devices got no reading at all this tick, and what happens to them?"
    def _expire(self, observed: Mapping[str, Mapping[str, int]], available: set[str]) -> None:
        for mac in list(self._tracks):
            if mac in observed:
                continue
            track = self._tracks[mac]
            if track.zone not in available:
                # Its AP is silent, so its absence proves nothing. Freeze rather than expire,
                # or an AP reboot empties the building on the dashboard. But an AP that never
                # comes back would freeze it forever: the track table then only ever grows,
                # and every stale device keeps padding its zone's count with a number nothing
                # downstream can tell from a live one. Past `frozen_polls` the outage is no
                # longer a reboot, and holding the device is a worse guess than dropping it.
                track.frozen_polls += 1
                if track.frozen_polls >= self.frozen_polls:
                    del self._tracks[mac]
                continue
            track.missed_polls += 1
            if track.missed_polls >= self.absent_polls:
                del self._tracks[mac]
