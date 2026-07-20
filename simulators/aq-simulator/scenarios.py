from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from enum import Enum

from physics import EnvironmentConditions

class Scenario(str, Enum):
    CLEAN_INDOOR   = "clean_indoor"
    OCCUPIED_OFFICE= "occupied_office"
    RUSH_HOUR      = "rush_hour"
    VENTILATION_ON = "ventilation_on"
    EVENING_IDLE   = "evening_idle"       # Low activity, windows closed


@dataclass
class ScenarioProfile:
    """
    Baseline EnvironmentConditions plus variability parameters for a scenario.

    * base: the long-run mean of each pollutant in this scenario
    * variability: ±1-sigma natural fluctuation (Gaussian) per tick
    * drift_rate: slow deterministic hourly trend in each metric
    """
    base: EnvironmentConditions
    variability: EnvironmentConditions   # σ per tick
    trend_rate: EnvironmentConditions    # linear drift per hour (can be negative)


# ----- Define each scenario profile ----------------------------------------

_PROFILES: dict[Scenario, ScenarioProfile] = {

    Scenario.CLEAN_INDOOR: ScenarioProfile(
        base         = EnvironmentConditions(pm25=6,   pm10=12,  co2=450,  voc=120, temperature=21, humidity=48),
        variability  = EnvironmentConditions(pm25=1,   pm10=2,   co2=20,   voc=15,  temperature=0.1,humidity=1),
        trend_rate   = EnvironmentConditions(pm25=0,   pm10=0,   co2=0,    voc=0,   temperature=0,  humidity=0),
    ),

    Scenario.OCCUPIED_OFFICE: ScenarioProfile(
        base         = EnvironmentConditions(pm25=14,  pm10=25,  co2=900,  voc=280, temperature=23, humidity=52),
        variability  = EnvironmentConditions(pm25=2,   pm10=4,   co2=80,   voc=40,  temperature=0.3,humidity=2),
        trend_rate   = EnvironmentConditions(pm25=0.2, pm10=0.3, co2=50,   voc=10,  temperature=0.1,humidity=0.5),
    ),

    Scenario.RUSH_HOUR: ScenarioProfile(
        base         = EnvironmentConditions(pm25=42,  pm10=80,  co2=560,  voc=380, temperature=22, humidity=55),
        variability  = EnvironmentConditions(pm25=8,   pm10=15,  co2=40,   voc=60,  temperature=0.2,humidity=2),
        trend_rate   = EnvironmentConditions(pm25=2,   pm10=3,   co2=10,   voc=20,  temperature=0,  humidity=0),
    ),

    Scenario.VENTILATION_ON: ScenarioProfile(
        base         = EnvironmentConditions(pm25=8,   pm10=15,  co2=430,  voc=110, temperature=20, humidity=44),
        variability  = EnvironmentConditions(pm25=1.5, pm10=3,   co2=15,   voc=10,  temperature=0.2,humidity=1.5),
        trend_rate   = EnvironmentConditions(pm25=-1,  pm10=-2,  co2=-80,  voc=-30, temperature=-0.1,humidity=-0.5),
    ),

    Scenario.EVENING_IDLE: ScenarioProfile(
        base         = EnvironmentConditions(pm25=10,  pm10=18,  co2=550,  voc=160, temperature=20, humidity=50),
        variability  = EnvironmentConditions(pm25=1.5, pm10=3,   co2=30,   voc=20,  temperature=0.1,humidity=1),
        trend_rate   = EnvironmentConditions(pm25=0.1, pm10=0.2, co2=15,   voc=5,   temperature=-0.1,humidity=0.2),
    ),
}


# Environment model — owns mutable state for one room

@dataclass
class EnvironmentModel:
    """
    Stateful model for a single sensor location.

    Call `advance(dt_hours)` on each simulation tick to evolve the environment.
    Read `current` to get the present EnvironmentConditions.
    """
    scenario: Scenario
    _current: EnvironmentConditions = field(init=False)
    _start_time: float = field(default_factory=time.monotonic, init=False)

    def __post_init__(self) -> None:
        profile = _PROFILES[self.scenario]
        # Initialise from base with a small Gaussian perturbation
        self._current = self._jitter(profile.base, profile.variability, scale=1.0)

    # ------------------------------------------------------------------ #

    @property
    def current(self) -> EnvironmentConditions:
        return self._current

    def advance(self, dt_hours: float) -> EnvironmentConditions:
        """
        Advance the environment by dt_hours (typically a few seconds expressed
        as a fraction of an hour).  Applies:
          1. Linear trend drift
          2. Gaussian tick-to-tick variability
          3. Diurnal modulation (temperature, CO2 follow a 24h sinusoid)
          4. Hard physical limits
        """
        profile = _PROFILES[self.scenario]
        base = profile.base
        variability = profile.variability
        trend = profile.trend_rate

        # --- 1. Trend drift ---
        elapsed_h = (time.monotonic() - self._start_time) / 3600

        def drifted(base_v: float, trend_v: float, cur_v: float) -> float:
            target = base_v + trend_v * elapsed_h
            # Mean-revert slowly so readings don't run to infinity
            reversion = 0.05 * dt_hours * (target - cur_v)
            return cur_v + reversion

        co2_trend   = drifted(base.co2,         trend.co2,         self._current.co2)
        voc_trend   = drifted(base.voc,         trend.voc,         self._current.voc)
        pm25_trend  = drifted(base.pm25,        trend.pm25,        self._current.pm25)
        pm10_trend  = drifted(base.pm10,        trend.pm10,        self._current.pm10)
        temp_trend  = drifted(base.temperature, trend.temperature, self._current.temperature)
        hum_trend   = drifted(base.humidity,    trend.humidity,    self._current.humidity)

        # --- 2. Diurnal modulation (hour of day, 0-23) ---
        hour_of_day = (time.time() % 86400) / 3600
        diurnal_temp = 1.5 * math.sin(math.pi * (hour_of_day - 6) / 12)   # peaks at 18:00
        diurnal_co2  = 50  * math.sin(math.pi * (hour_of_day - 8) / 8)    # peaks at 16:00

        # --- 3. Tick variability (Gaussian noise on the environment itself) ---
        new_state = EnvironmentConditions(
            pm25        = pm25_trend  + random.gauss(0, variability.pm25),
            pm10        = pm10_trend  + random.gauss(0, variability.pm10),
            co2         = co2_trend   + random.gauss(0, variability.co2)   + diurnal_co2,
            voc         = voc_trend   + random.gauss(0, variability.voc),
            temperature = temp_trend  + random.gauss(0, variability.temperature) + diurnal_temp,
            humidity    = hum_trend   + random.gauss(0, variability.humidity),
        )

        # --- 4. Physical limits ---
        new_state.pm25        = max(0.5, new_state.pm25)
        new_state.pm10        = max(new_state.pm25, new_state.pm10)
        new_state.co2         = max(350.0, new_state.co2)
        new_state.voc         = max(20.0, new_state.voc)
        new_state.humidity    = min(100.0, max(5.0, new_state.humidity))

        self._current = new_state
        return self._current

    # ------------------------------------------------------------------ #

    @staticmethod
    def _jitter(base: EnvironmentConditions,
                sigma: EnvironmentConditions,
                scale: float = 1.0) -> EnvironmentConditions:
        """Return base plus a Gaussian perturbation scaled by `scale`."""
        return EnvironmentConditions(
            pm25        = base.pm25        + random.gauss(0, sigma.pm25        * scale),
            pm10        = base.pm10        + random.gauss(0, sigma.pm10        * scale),
            co2         = base.co2         + random.gauss(0, sigma.co2         * scale),
            voc         = base.voc         + random.gauss(0, sigma.voc         * scale),
            temperature = base.temperature + random.gauss(0, sigma.temperature * scale),
            humidity    = base.humidity    + random.gauss(0, sigma.humidity    * scale),
        )