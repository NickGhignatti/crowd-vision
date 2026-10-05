"""Every physical and behavioural number the simulator uses. Defaults are educated guesses."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class SimConfig:
    # Radio: multi-wall log-distance model, phone transmitting, router listening.
    rssi_at_1m_dbm: float = -40.0
    path_loss_exponent: float = 2.2
    wall_loss_db: float = 5.0
    slab_loss_db: float = 18.0
    router_gain_spread_db: float = 3.0
    phone_gain_spread_db: float = 4.0
    shadow_sigma_db: float = 4.0
    shadow_period_s: float = 30.0
    fading_sigma_db: float = 2.0
    probe_sensitivity_dbm: float = -92.0

    # Association: sticky clients roam only once their own link degrades.
    join_dbm: float = -82.0
    roam_trigger_dbm: float = -72.0
    roam_delta_db: float = 8.0
    drop_dbm: float = -88.0
    assoc_step_s: float = 5.0
    ap_max_inactivity_s: float = 300.0

    # Scanning: unmeasured on real phones; a walk log on real hardware replaces these.
    screen_on_dwelling: float = 0.15
    screen_on_walking: float = 0.6
    screen_bucket_s: float = 60.0
    scan_interval_on_s: float = 40.0
    scan_interval_off_s: float = 600.0
    scan_slot_s: float = 10.0
    burst_spread_s: float = 1.5
    probe_random_mac_fraction: float = 1.0

    phones_per_room: int = 4
    passersby_per_hour: int = 30

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> SimConfig:
        return cls(
            phones_per_room=int(env.get("AP_SIM_PHONES_PER_ROOM", cls.phones_per_room)),
            passersby_per_hour=int(env.get("AP_SIM_PASSERSBY_PER_HOUR", cls.passersby_per_hour)),
            probe_random_mac_fraction=float(
                env.get("AP_SIM_PROBE_RANDOM_MAC_FRACTION", cls.probe_random_mac_fraction)
            ),
        )
