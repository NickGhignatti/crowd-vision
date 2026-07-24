from __future__ import annotations


class SensorErrorModel:
    def apply(self, readings: dict[str, float]) -> dict[str, float]:
        return dict(readings)

