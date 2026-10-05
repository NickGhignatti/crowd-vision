"""Indoor radio: log-distance loss, and noise drawn from a hash so one tick reads alike to every caller."""

from __future__ import annotations

import hashlib
import math


def free_space_rssi(distance_m: float, rssi_at_1m_dbm: float, exponent: float) -> float:
    """Signal at `distance_m`, clamped to 1 m so the router itself is not infinitely loud."""
    return rssi_at_1m_dbm - 10 * exponent * math.log10(max(distance_m, 1.0))


def uniform(*key: object) -> float:
    """A uniform draw in [0, 1), fixed by `key`."""
    digest = hashlib.blake2b(repr(key).encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big") / 2**64


def gaussian(sigma: float, *key: object) -> float:
    """A normal draw with spread `sigma`, fixed by `key` (Box–Muller over two hashed uniforms)."""
    radius = math.sqrt(-2.0 * math.log(1.0 - uniform(*key, "r")))
    return sigma * radius * math.cos(2.0 * math.pi * uniform(*key, "a"))
