"""Resolve associated stations to zones.

The identifier never leaves this module's caller: a MAC enters, a zone count leaves.
Storing a sequence of positions per device would make the data personal under GDPR
however it is hashed, so the collector only ever emits aggregates.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

Reading = tuple[str, str, int]
"""One station as one AP heard it: (ap, mac, rssi_dbm)."""


def assign_zones(readings: Iterable[Reading], ap_zones: Mapping[str, str]) -> dict[str, str]:
    """Map each MAC to the zone of the AP that heard it loudest.

    Union by MAC, never sum per-AP client lists: a device in range of three APs appears in
    three lists, and summing multiplies the count by three -- which looks exactly like the
    MAC-randomization bug people expect, so it gets misdiagnosed.

    Ties break on AP name, not on iteration order, so two APs reporting the same RSSI do not
    flip the device between zones on alternate polls.
    """
    best: dict[str, tuple[int, str]] = {}
    for ap, mac, rssi in readings:
        if ap not in ap_zones:
            continue
        candidate = (rssi, ap)
        if mac not in best or candidate > best[mac]:
            best[mac] = candidate
    return {mac: ap_zones[ap] for mac, (_, ap) in best.items()}


def zone_counts(assignment: Mapping[str, str], zones: Iterable[str]) -> dict[str, int]:
    """Devices per zone, with an explicit 0 for empty zones.

    An absent key and a zero are different facts downstream: a missing zone reads as a dead
    collector, a zero reads as an empty room.
    """
    counts = dict.fromkeys(zones, 0)
    for zone in assignment.values():
        if zone in counts:
            counts[zone] += 1
    return counts
