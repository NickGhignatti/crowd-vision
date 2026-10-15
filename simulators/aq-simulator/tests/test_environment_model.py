"""The daily wave and tick noise must oscillate around the scenario base, not pile up in the state."""

import random
from types import SimpleNamespace

import pytest

import scenarios
from physics import CO2_FLOOR_PPM
from scenarios import EnvironmentModel, Scenario

TICK_S = 10


@pytest.fixture
def clock(monkeypatch):
    now = SimpleNamespace(t=0.0)
    fake = SimpleNamespace(time=lambda: now.t, monotonic=lambda: now.t)
    monkeypatch.setattr(scenarios, "time", fake)
    return now


def test_a_day_of_ticks_stays_near_the_base(clock):
    random.seed(7)
    model = EnvironmentModel(Scenario.CLEAN_INDOOR)
    temps, co2s = [], []
    for _ in range(86400 // TICK_S):
        clock.t += TICK_S
        state = model.advance(TICK_S / 3600)
        temps.append(state.temperature)
        co2s.append(state.co2)

    assert max(abs(t - 21) for t in temps) < 2.5
    assert max(abs(c - 450) for c in co2s) < 260


@pytest.mark.parametrize(("field", "peak_hour"), [("temperature", 18), ("co2", 16)])
def test_the_daily_wave_peaks_at_its_hour(clock, monkeypatch, field, peak_hour):
    monkeypatch.setattr(scenarios.random, "gauss", lambda mu, sigma: mu)
    model = EnvironmentModel(Scenario.CLEAN_INDOOR)
    by_hour = {}
    for hour in range(24):
        clock.t = hour * 3600
        by_hour[hour] = getattr(model.advance(0.0), field)

    assert max(by_hour, key=by_hour.__getitem__) == peak_hour


def test_co2_never_drops_below_the_outdoor_floor(clock):
    random.seed(1)
    model = EnvironmentModel(Scenario.VENTILATION_ON)
    for _ in range(86400 // TICK_S):
        clock.t += TICK_S
        assert model.advance(TICK_S / 3600).co2 >= CO2_FLOOR_PPM
