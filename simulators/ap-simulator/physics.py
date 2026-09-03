"""Log-distance path-loss RSSI model. Not a full RF simulator — just enough
signal/distance/noise behaviour to exercise zone assignment and hysteresis
tuning without real hardware."""

from __future__ import annotations

import math


def rssi_dbm(distance_m: float, tx_power_dbm: float, path_loss_exponent: float) -> float:
    """Signal at `distance_m`, clamped to 1m to avoid log(0) at the AP itself."""
    return tx_power_dbm - 10 * path_loss_exponent * math.log10(max(distance_m, 1.0))
