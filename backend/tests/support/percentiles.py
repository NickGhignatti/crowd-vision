import statistics

# Below this, "p99" is just the max, not a percentile — nearest-rank needs at
# least 100 points before the 99th-percentile index differs from the last
# one. Same lesson as twin-service's tests/steps/load.rs::MIN_SAMPLES_FOR_P99.
MIN_SAMPLES_FOR_P99 = 100


def p99(samples: list[float]) -> float:
    if len(samples) < MIN_SAMPLES_FOR_P99:
        raise ValueError(
            f"p99 over {len(samples)} samples is just the max, not a "
            f"percentile — need at least {MIN_SAMPLES_FOR_P99}"
        )
    return statistics.quantiles(samples, n=100)[98]
