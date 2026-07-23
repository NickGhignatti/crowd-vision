from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class EnvironmentConditions:
    """
    A snapshot of the true physical state of the environment at a moment in
    time. This is what sensors try — imperfectly — to measure.
    """
    pm25: float          # Fine particulate matter      µg/m³   (AQI breakpoints: good <12, unhealthy >55)
    pm10: float          # Coarse particulate matter    µg/m³   (good <54, unhealthy >155)
    co2: float           # Carbon dioxide               ppm     (outdoor ~420, stuffy room >1000)
    voc: float           # Total volatile organics      ppb     (clean <200, elevated >500)
    temperature: float   # Air temperature              °C      (comfort band 18-26)
    humidity: float      # Relative humidity            %RH     (comfort band 30-60)


# Per-pollutant physics helpers

def compute_pm25(conditions: EnvironmentConditions) -> float:
    """
    PM2.5 — particles ≤2.5 µm.
    Physical truth: value clipped to non-negative; particles follow a
    log-normal distribution so we enforce a realistic floor of ~1 µg/m³
    indoors even in the cleanest environments.
    """
    return max(1.0, conditions.pm25)


def compute_pm10(conditions: EnvironmentConditions) -> float:
    """
    PM10 — particles ≤10 µm.
    Physically, PM10 ≥ PM2.5 (the coarse fraction is additive).
    If the model accidentally set PM10 < PM2.5 we correct it here.
    """
    return max(compute_pm25(conditions), conditions.pm10)


def compute_co2(conditions: EnvironmentConditions) -> float:
    """
    CO2 concentration.
    Atmospheric background is ~420 ppm; indoors it rises with occupancy.
    We floor at atmospheric baseline.
    """
    return max(420.0, conditions.co2)


def compute_voc(conditions: EnvironmentConditions) -> float:
    """
    Total VOC (aggregated as tVOC in ppb).
    Clean outdoor air: ~50–100 ppb.  Indoors baseline: ~100–200 ppb.
    Floor set at 50 ppb — cleaner than that is physically implausible.
    """
    return max(50.0, conditions.voc)


def compute_temperature(conditions: EnvironmentConditions) -> float:
    """Temperature — no physical clipping needed, returned as-is."""
    return conditions.temperature


def compute_humidity(conditions: EnvironmentConditions) -> float:
    """
    Relative humidity — physically bounded [0, 100].
    We also floor at 5 %RH because perfectly dry air is an edge case.
    """
    return min(100.0, max(5.0, conditions.humidity))


def compute_all(conditions: EnvironmentConditions) -> dict[str, float]:
    return {
        "pm25":        compute_pm25(conditions),
        "pm10":        compute_pm10(conditions),
        "co2":         compute_co2(conditions),
        "voc":         compute_voc(conditions),
        "temperature": compute_temperature(conditions),
        "humidity":    compute_humidity(conditions),
    }


# AQI helper (US EPA standard — PM2.5 and PM10 only)

_AQI_PM25_BREAKPOINTS = [
    (0.0,   12.0,   0,   50),
    (12.1,  35.4,  51,  100),
    (35.5,  55.4, 101,  150),
    (55.5, 150.4, 151,  200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
]

def pm25_to_aqi(pm25: float) -> int:
    """Convert a PM2.5 concentration (µg/m³) to US EPA AQI (0–500)."""
    for c_lo, c_hi, aqi_lo, aqi_hi in _AQI_PM25_BREAKPOINTS:
        if c_lo <= pm25 <= c_hi:
            return round(
                (aqi_hi - aqi_lo) / (c_hi - c_lo) * (pm25 - c_lo) + aqi_lo
            )
    return 500  # Beyond scale


# Indoor AQI helper (custom weighted index)

_INDOOR_AQI_LIMITS = {
    "co2": 1000.0,
    "pm25": 15.0,
    "pm10": 50.0,
    "voc": 500.0
}

_INDOOR_AQI_WEIGHTS = {
    "co2": 1.0,
    "pm25": 1.0,
    "pm10": 1.0,
    "voc": 1.0
}

def compute_indoor_aqi(pm25: float, pm10: float, co2: float, voc: float) -> float:
    """
    Calculate Indoor Air Quality Index (IAQI) based on user-provided formula.
    IAQI = (sum(Ratio_i * Weight_i) / sum(Weight_i)) * 100%
    where Ratio_i = Value_i / Limit_i
    """
    metrics = {
        "pm25": pm25,
        "pm10": pm10,
        "co2": co2,
        "voc": voc
    }

    total_weighted_score = 0.0
    total_weight = 0.0

    for key, value in metrics.items():
        limit = _INDOOR_AQI_LIMITS[key]
        weight = _INDOOR_AQI_WEIGHTS[key]

        # Handle potential NaN or non-numeric values
        try:
            val = float(value)
            if math.isnan(val):
                val = 0.0
        except (TypeError, ValueError):
            val = 0.0

        ratio = val / limit
        total_weighted_score += ratio * weight
        total_weight += weight

    if total_weight == 0:
        return 0.0

    result = (total_weighted_score / total_weight) * 100.0
    
    if math.isnan(result) or math.isinf(result):
        return 0.0

    return round(result, 2)