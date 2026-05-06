from __future__ import annotations

from typing import Dict


class SensorErrorModel:
    def apply(self, readings: Dict[str, float]) -> Dict[str, float]:
        return dict(readings)

