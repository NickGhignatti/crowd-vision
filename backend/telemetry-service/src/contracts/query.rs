const DAY_MS: i64 = 86_400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AggMode {
    Avg,
    Sum,
    Min,
    Max,
}

impl AggMode {
    pub fn parse(input: Option<&str>) -> Self {
        match input {
            Some("sum") => AggMode::Sum,
            Some("min") => AggMode::Min,
            Some("max") => AggMode::Max,
            _ => AggMode::Avg,
        }
    }

    pub fn sql(&self) -> &'static str {
        match self {
            AggMode::Avg => "avg",
            AggMode::Sum => "sum",
            AggMode::Min => "min",
            AggMode::Max => "max",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeRange {
    OneDay,
    OneWeek,
    OneMonth,
    Custom { start_ms: i64, end_ms: i64 },
}

impl TimeRange {
    pub fn parse(
        input: Option<&str>,
        start_ms: Option<i64>,
        end_ms: Option<i64>,
        now_ms: i64,
    ) -> Result<Self, String> {
        match input {
            Some("1W") => Ok(TimeRange::OneWeek),
            Some("1M") => Ok(TimeRange::OneMonth),
            Some("custom") => match start_ms {
                Some(start_ms) => Ok(TimeRange::Custom {
                    start_ms,
                    end_ms: end_ms.unwrap_or(now_ms),
                }),
                None => Err("start: a custom range requires an explicit start.".to_owned()),
            },
            _ => Ok(TimeRange::OneDay),
        }
    }

    pub fn bucket_interval(&self) -> &'static str {
        match self {
            TimeRange::OneDay => "1 hour",
            _ => "1 day",
        }
    }

    pub fn window(&self, now_ms: i64) -> (i64, i64) {
        match self {
            TimeRange::OneDay => (now_ms - DAY_MS, now_ms),
            TimeRange::OneWeek => (now_ms - 7 * DAY_MS, now_ms),
            TimeRange::OneMonth => (now_ms - 30 * DAY_MS, now_ms),
            TimeRange::Custom { start_ms, end_ms } => (*start_ms, *end_ms),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_000_000_000;
    const HOUR_MS: i64 = 3_600_000;

    fn range(input: Option<&str>) -> TimeRange {
        TimeRange::parse(input, None, None, NOW).unwrap()
    }

    #[test]
    fn an_unrecognised_agg_mode_falls_back_to_avg() {
        assert_eq!(AggMode::parse(Some("median")), AggMode::Avg);
        assert_eq!(AggMode::parse(None), AggMode::Avg);
        assert_eq!(AggMode::parse(Some("")), AggMode::Avg);
    }

    #[test]
    fn every_supported_agg_mode_is_recognised() {
        assert_eq!(AggMode::parse(Some("sum")), AggMode::Sum);
        assert_eq!(AggMode::parse(Some("min")), AggMode::Min);
        assert_eq!(AggMode::parse(Some("max")), AggMode::Max);
        assert_eq!(AggMode::parse(Some("avg")), AggMode::Avg);
    }

    #[test]
    fn an_agg_mode_maps_to_its_sql_aggregate() {
        assert_eq!(AggMode::Avg.sql(), "avg");
        assert_eq!(AggMode::Sum.sql(), "sum");
        assert_eq!(AggMode::Min.sql(), "min");
        assert_eq!(AggMode::Max.sql(), "max");
    }

    #[test]
    fn an_unrecognised_time_range_falls_back_to_one_day() {
        assert_eq!(range(Some("1Y")), TimeRange::OneDay);
        assert_eq!(range(None), TimeRange::OneDay);
        assert_eq!(range(Some("1D")), TimeRange::OneDay);
    }

    #[test]
    fn one_day_buckets_hourly_everything_else_buckets_daily() {
        assert_eq!(TimeRange::OneDay.bucket_interval(), "1 hour");
        assert_eq!(TimeRange::OneWeek.bucket_interval(), "1 day");
        assert_eq!(TimeRange::OneMonth.bucket_interval(), "1 day");
        assert_eq!(
            TimeRange::Custom {
                start_ms: 0,
                end_ms: NOW
            }
            .bucket_interval(),
            "1 day"
        );
    }

    #[test]
    fn a_custom_range_requires_an_explicit_start() {
        let error = TimeRange::parse(Some("custom"), None, Some(NOW), NOW)
            .err()
            .unwrap();
        assert!(error.contains("start"));
    }

    #[test]
    fn a_custom_range_with_start_and_end_produces_that_window() {
        let range = TimeRange::parse(Some("custom"), Some(1_000), Some(2_000), NOW).unwrap();
        assert_eq!(range.window(NOW), (1_000, 2_000));
    }

    #[test]
    fn a_custom_range_without_an_end_runs_to_now() {
        let range = TimeRange::parse(Some("custom"), Some(1_000), None, NOW).unwrap();
        assert_eq!(range.window(NOW), (1_000, NOW));
    }

    #[test]
    fn a_relative_range_ends_now_and_starts_its_own_length_earlier() {
        assert_eq!(TimeRange::OneDay.window(NOW), (NOW - DAY_MS, NOW));
        assert_eq!(TimeRange::OneWeek.window(NOW), (NOW - 7 * DAY_MS, NOW));
        assert_eq!(TimeRange::OneMonth.window(NOW), (NOW - 30 * DAY_MS, NOW));
    }

    #[test]
    fn a_one_day_window_holds_twenty_four_hourly_buckets() {
        let (start, end) = TimeRange::OneDay.window(NOW);
        assert_eq!((end - start) / HOUR_MS, 24);
    }
}
