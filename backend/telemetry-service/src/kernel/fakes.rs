use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::plugin::{
    BoundDirection, BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin,
};
use crate::contracts::query::Bucket;
use crate::contracts::reading::Reading;
use crate::contracts::threshold::Bounds;
use crate::kernel::ports::{Alerts, Clock, Fanout, ReadingStore, ThresholdStore};
use async_trait::async_trait;
use serde_json::{Map, Value};
use std::sync::Mutex;

static FAKE_DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    key: "fake",
    label: "Fake",
    interface_name: "IFake",
    unit: None,
    fields: &[
        FieldSpec {
            name: "buildingId",
            kind: FieldKind::NonEmptyString,
            required: true,
        },
        FieldSpec {
            name: "roomId",
            kind: FieldKind::NonEmptyString,
            required: true,
        },
        FieldSpec {
            name: "timestamp",
            kind: FieldKind::Finite,
            required: true,
        },
        FieldSpec {
            name: "fake",
            kind: FieldKind::Finite,
            required: true,
        },
    ],
};

static FAKE_BOUNDS: &[BoundSpec] = &[
    BoundSpec {
        key: "maxFake",
        direction: BoundDirection::Above,
    },
    BoundSpec {
        key: "minFake",
        direction: BoundDirection::Below,
    },
];

pub struct FakePlugin {
    pub key: &'static str,
}

impl Default for FakePlugin {
    fn default() -> Self {
        Self { key: "fake" }
    }
}

impl SensorPlugin for FakePlugin {
    fn key(&self) -> &'static str {
        self.key
    }

    fn descriptor(&self) -> &MetricDescriptor {
        &FAKE_DESCRIPTOR
    }

    fn validate(&self, payload: &Value) -> Result<Reading, Vec<String>> {
        if payload["fake"].as_f64().is_none() {
            return Err(vec!["fake: must be a finite number.".to_owned()]);
        }
        Ok(Reading {
            building_id: payload["buildingId"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            room_id: payload["roomId"].as_str().unwrap_or_default().to_owned(),
            metric: self.key.to_owned(),
            ts_ms: payload["timestamp"].as_f64().unwrap_or_default() as i64,
            value: payload["fake"].as_f64().unwrap_or_default(),
            payload: payload.as_object().cloned().unwrap_or_default(),
        })
    }

    fn bounds(&self) -> &'static [BoundSpec] {
        FAKE_BOUNDS
    }

    fn alert_channel(&self) -> &'static str {
        "alerts:fake"
    }
}

pub fn reading(metric: &str, building_id: &str, room_id: &str, ts_ms: i64, value: f64) -> Reading {
    Reading {
        building_id: building_id.to_owned(),
        room_id: room_id.to_owned(),
        metric: metric.to_owned(),
        ts_ms,
        value,
        payload: Map::default(),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SeriesCall {
    pub building_id: String,
    pub metric: String,
    pub room_id: Option<String>,
    pub window: (i64, i64),
    pub bucket: String,
    pub agg: String,
}

#[derive(Default)]
pub struct FakeReadings {
    pub inserted: Mutex<Vec<Reading>>,
    pub rows: Vec<Reading>,
    pub series: Vec<Bucket>,
    pub series_calls: Mutex<Vec<SeriesCall>>,
    pub refuse: bool,
}

#[async_trait]
impl ReadingStore for FakeReadings {
    async fn insert(&self, reading: &Reading) -> anyhow::Result<()> {
        if self.refuse {
            anyhow::bail!("readings refused");
        }
        self.inserted.lock().unwrap().push(reading.clone());
        Ok(())
    }

    async fn latest(
        &self,
        building_id: &str,
        metric: &str,
        room_id: &str,
    ) -> anyhow::Result<Option<Reading>> {
        if self.refuse {
            anyhow::bail!("readings refused");
        }
        Ok(self
            .rows
            .iter()
            .filter(|r| r.building_id == building_id && r.metric == metric && r.room_id == room_id)
            .max_by_key(|r| r.ts_ms)
            .cloned())
    }

    async fn latest_per_room(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Vec<Reading>> {
        if self.refuse {
            anyhow::bail!("readings refused");
        }
        let mut newest: Vec<Reading> = Vec::new();
        for row in self
            .rows
            .iter()
            .filter(|r| r.building_id == building_id && r.metric == metric)
        {
            match newest.iter_mut().find(|r| r.room_id == row.room_id) {
                Some(existing) if existing.ts_ms < row.ts_ms => *existing = row.clone(),
                Some(_) => {}
                None => newest.push(row.clone()),
            }
        }
        newest.sort_by_key(|r| std::cmp::Reverse(r.ts_ms));
        Ok(newest)
    }

    async fn series(
        &self,
        building_id: &str,
        metric: &str,
        room_id: Option<&str>,
        window: (i64, i64),
        bucket: &str,
        agg: &str,
    ) -> anyhow::Result<Vec<Bucket>> {
        if self.refuse {
            anyhow::bail!("readings refused");
        }
        self.series_calls.lock().unwrap().push(SeriesCall {
            building_id: building_id.to_owned(),
            metric: metric.to_owned(),
            room_id: room_id.map(str::to_owned),
            window,
            bucket: bucket.to_owned(),
            agg: agg.to_owned(),
        });
        Ok(self.series.clone())
    }
}

#[derive(Default)]
pub struct FakeThresholds {
    pub bounds: Option<Bounds>,
    pub refuse: bool,
}

#[async_trait]
impl ThresholdStore for FakeThresholds {
    async fn resolve(
        &self,
        _building_id: &str,
        _metric: &str,
        _room_id: &str,
    ) -> anyhow::Result<Option<Bounds>> {
        if self.refuse {
            anyhow::bail!("thresholds refused");
        }
        Ok(self.bounds.clone())
    }
}

#[derive(Default)]
pub struct FakeFanout {
    pub published: Mutex<Vec<TelemetryEvent>>,
}

#[async_trait]
impl Fanout for FakeFanout {
    async fn publish_telemetry(&self, event: &TelemetryEvent) {
        self.published.lock().unwrap().push(event.clone());
    }
}

#[derive(Default)]
pub struct FakeAlerts {
    pub published: Mutex<Vec<(String, AlertPayload)>>,
}

#[async_trait]
impl Alerts for FakeAlerts {
    async fn publish_breach(&self, channel: &str, alert: &AlertPayload) {
        self.published
            .lock()
            .unwrap()
            .push((channel.to_owned(), alert.clone()));
    }
}

pub struct FixedClock(pub i64);

impl Default for FixedClock {
    fn default() -> Self {
        Self(1_700_000_000_000)
    }
}

impl Clock for FixedClock {
    fn now_ms(&self) -> i64 {
        self.0
    }
}
