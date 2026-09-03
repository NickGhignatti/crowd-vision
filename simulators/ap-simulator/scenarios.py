"""Topology presets. `corridor` mirrors phase 1's MAC-stability walk (two APs,
one phone, no stops). `grid` mirrors phase 2's zone-separation walk (three
APs, stand-still holds so /control/ground-truth can back-fill
notes/ground-truth.csv)."""

from __future__ import annotations

from schemas import ApConfig, DeviceRoute, ScenarioConfig, Waypoint


def corridor() -> ScenarioConfig:
    return ScenarioConfig(
        aps=[
            ApConfig(id="ap-a", iface="wlan0", reader="hostapd", zone_id="zone-a", x=0.0, y=0.0),
            ApConfig(id="ap-b", iface="wlan0", reader="iwinfo", zone_id="zone-b", x=20.0, y=0.0),
        ],
        devices=[
            DeviceRoute(
                mac="aa:bb:cc:00:00:01",
                waypoints=[Waypoint(x=0.0, y=0.0), Waypoint(x=20.0, y=0.0)],
                speed_mps=1.2,
            ),
        ],
    )


def grid() -> ScenarioConfig:
    return ScenarioConfig(
        aps=[
            ApConfig(id="ap-lobby", iface="wlan0", zone_id="lobby", x=0.0, y=0.0),
            ApConfig(id="ap-hall", iface="wlan0", zone_id="hall", x=15.0, y=0.0),
            ApConfig(id="ap-office", iface="wlan0", zone_id="office", x=15.0, y=15.0),
        ],
        devices=[
            DeviceRoute(
                mac="aa:bb:cc:00:00:01",
                waypoints=[
                    Waypoint(x=0.0, y=0.0, hold_s=60.0),
                    Waypoint(x=15.0, y=0.0, hold_s=60.0),
                    Waypoint(x=15.0, y=15.0, hold_s=60.0),
                ],
                speed_mps=1.2,
            ),
            DeviceRoute(
                mac="aa:bb:cc:00:00:02",
                waypoints=[
                    Waypoint(x=15.0, y=15.0, hold_s=45.0),
                    Waypoint(x=15.0, y=0.0, hold_s=45.0),
                ],
                speed_mps=1.0,
                phase_offset_s=20.0,
            ),
        ],
    )


PRESETS = {"corridor": corridor, "grid": grid}
