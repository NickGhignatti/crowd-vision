use crate::contracts::building::RegisteredBuilding;
use crate::contracts::event::{AlertPayload, TelemetryEvent};
use crate::contracts::plugin::{
    ActionSpec, BoundDirection, BoundSpec, FieldKind, FieldSpec, MetricDescriptor, SensorPlugin,
};
use crate::contracts::query::Bucket;
use crate::contracts::reading::Reading;
use crate::contracts::sensor::{Command, Sensor};
use crate::contracts::threshold::{Bounds, RoomTemperatureLimit, TemperatureLimits};
use crate::kernel::ports::{
    ActionDispatch, Alerts, BuildingDirectory, BuildingStore, Clock, DispatchError, Fanout,
    ReadingStore, RegisterError, RegistrationEvents, SensorStore, ThresholdStore,
};
use async_trait::async_trait;
use serde_json::{Map, Value};
use std::sync::Mutex;

static FAKE_DESCRIPTOR: MetricDescriptor = MetricDescriptor {
    key: "fake",
    value_field: "fake",
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

    fn actions(&self) -> &'static [ActionSpec] {
        FAKE_ACTIONS
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

#[derive(Debug, Clone, PartialEq)]
pub struct ThresholdRow {
    pub building_id: String,
    pub room_id: Option<String>,
    pub metric: String,
    pub bounds: Bounds,
}

pub fn row(building_id: &str, room_id: Option<&str>, metric: &str, bounds: Value) -> ThresholdRow {
    ThresholdRow {
        building_id: building_id.to_owned(),
        room_id: room_id.map(str::to_owned),
        metric: metric.to_owned(),
        bounds: bounds.as_object().cloned().unwrap_or_default(),
    }
}

#[derive(Default)]
pub struct FakeThresholds {
    pub rows: Mutex<Vec<ThresholdRow>>,
    pub rooms: Vec<String>,
    pub refuse: bool,
}

impl FakeThresholds {
    pub fn with(rows: Vec<ThresholdRow>) -> Self {
        Self {
            rows: Mutex::new(rows),
            ..Default::default()
        }
    }

    fn find(&self, building_id: &str, room_id: Option<&str>, metric: &str) -> Option<Bounds> {
        self.rows
            .lock()
            .unwrap()
            .iter()
            .find(|r| {
                r.building_id == building_id
                    && r.room_id.as_deref() == room_id
                    && r.metric == metric
            })
            .map(|r| r.bounds.clone())
    }
}

#[async_trait]
impl ThresholdStore for FakeThresholds {
    async fn resolve(
        &self,
        building_id: &str,
        metric: &str,
        room_id: &str,
    ) -> anyhow::Result<Option<Bounds>> {
        if self.refuse {
            anyhow::bail!("thresholds refused");
        }
        Ok(self
            .find(building_id, Some(room_id), metric)
            .or_else(|| self.find(building_id, None, metric)))
    }

    async fn building_bounds(
        &self,
        building_id: &str,
        metric: &str,
    ) -> anyhow::Result<Option<Bounds>> {
        if self.refuse {
            anyhow::bail!("thresholds refused");
        }
        Ok(self.find(building_id, None, metric))
    }

    async fn upsert(
        &self,
        building_id: &str,
        room_id: Option<&str>,
        metric: &str,
        patch: &Bounds,
    ) -> anyhow::Result<Bounds> {
        if self.refuse {
            anyhow::bail!("thresholds refused");
        }
        let mut rows = self.rows.lock().unwrap();
        let existing = rows.iter_mut().find(|r| {
            r.building_id == building_id && r.room_id.as_deref() == room_id && r.metric == metric
        });
        match existing {
            Some(existing) => {
                existing.bounds.extend(patch.clone());
                Ok(existing.bounds.clone())
            }
            None => {
                rows.push(ThresholdRow {
                    building_id: building_id.to_owned(),
                    room_id: room_id.map(str::to_owned),
                    metric: metric.to_owned(),
                    bounds: patch.clone(),
                });
                Ok(patch.clone())
            }
        }
    }

    async fn temperature_limits(
        &self,
        building_id: &str,
    ) -> anyhow::Result<Option<TemperatureLimits>> {
        if self.refuse {
            anyhow::bail!("thresholds refused");
        }
        if self.rooms.is_empty() && self.find(building_id, None, "temperature").is_none() {
            return Ok(None);
        }
        let max_of = |bounds: Option<Bounds>| bounds.and_then(|b| b.get("maxTemp")?.as_f64());
        Ok(Some(TemperatureLimits {
            building_id: building_id.to_owned(),
            max_temperature: max_of(self.find(building_id, None, "temperature")),
            rooms: self
                .rooms
                .iter()
                .map(|room_id| RoomTemperatureLimit {
                    room_id: room_id.clone(),
                    max_temperature: max_of(self.find(building_id, Some(room_id), "temperature")),
                })
                .collect(),
        }))
    }
}

#[derive(Default)]
pub struct FakeSensors {
    pub registered: Mutex<Vec<Sensor>>,
    pub refuse: bool,
}

#[async_trait]
impl SensorStore for FakeSensors {
    async fn register(&self, sensor: &Sensor) -> Result<(), RegisterError> {
        if self.refuse {
            return Err(RegisterError::Other(anyhow::anyhow!("sensors refused")));
        }
        let mut registered = self.registered.lock().unwrap();
        if registered.iter().any(|s| {
            s.building_id == sensor.building_id
                && s.room_id == sensor.room_id
                && s.sensor_id == sensor.sensor_id
        }) {
            return Err(RegisterError::AlreadyExists);
        }
        registered.push(sensor.clone());
        Ok(())
    }

    async fn by_building(&self, building_id: &str) -> anyhow::Result<Vec<Sensor>> {
        if self.refuse {
            anyhow::bail!("sensors refused");
        }
        Ok(self
            .registered
            .lock()
            .unwrap()
            .iter()
            .filter(|s| s.building_id == building_id)
            .cloned()
            .collect())
    }

    async fn by_room(&self, building_id: &str, room_id: &str) -> anyhow::Result<Vec<Sensor>> {
        if self.refuse {
            anyhow::bail!("sensors refused");
        }
        Ok(self
            .registered
            .lock()
            .unwrap()
            .iter()
            .filter(|s| s.building_id == building_id && s.room_id == room_id)
            .cloned()
            .collect())
    }
}

static FAKE_ACTIONS: &[ActionSpec] = &[
    ActionSpec {
        name: "setTarget",
        label: "Set target",
        parameters: &[FieldSpec {
            name: "target",
            kind: FieldKind::Finite,
            required: true,
        }],
    },
    ActionSpec {
        name: "increase",
        label: "Increase",
        parameters: &[FieldSpec {
            name: "step",
            kind: FieldKind::Finite,
            required: false,
        }],
    },
];

#[derive(Default)]
pub struct FakeDispatch {
    pub sent: Mutex<Vec<Command>>,
    pub unconfigured: bool,
    pub status: Option<u16>,
    pub unreachable: bool,
}

#[async_trait]
impl ActionDispatch for FakeDispatch {
    async fn dispatch(&self, command: &Command) -> Result<(), DispatchError> {
        if self.unconfigured {
            return Err(DispatchError::Unconfigured(format!(
                "no binding for sensor {}.",
                command.sensor_id
            )));
        }
        if self.unreachable {
            return Err(DispatchError::Unreachable("connection refused".to_owned()));
        }
        if let Some(status) = self.status {
            return Err(DispatchError::Status(status));
        }
        self.sent.lock().unwrap().push(command.clone());
        Ok(())
    }
}

#[derive(Default)]
pub struct FakeBuildings {
    pub upserted: Mutex<Vec<RegisteredBuilding>>,
    pub refuse: bool,
}

#[async_trait]
impl BuildingStore for FakeBuildings {
    async fn upsert(&self, building: &RegisteredBuilding) -> anyhow::Result<()> {
        if self.refuse {
            anyhow::bail!("buildings refused");
        }
        let mut upserted = self.upserted.lock().unwrap();
        match upserted.iter_mut().find(|b| b.id == building.id) {
            Some(existing) => *existing = building.clone(),
            None => upserted.push(building.clone()),
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct FakeEvents {
    pub completed: Mutex<Vec<(String, Result<(), String>)>>,
}

#[async_trait]
impl RegistrationEvents for FakeEvents {
    async fn publish_completed(
        &self,
        building_id: &str,
        outcome: Result<(), String>,
    ) -> anyhow::Result<()> {
        self.completed
            .lock()
            .unwrap()
            .push((building_id.to_owned(), outcome));
        Ok(())
    }
}

#[derive(Default)]
pub struct FakeDirectory {
    pub domains: Vec<String>,
    pub refuse: bool,
}

#[async_trait]
impl BuildingDirectory for FakeDirectory {
    async fn domains_of(&self, _building_id: &str, _claims: &str) -> anyhow::Result<Vec<String>> {
        if self.refuse {
            anyhow::bail!("directory refused");
        }
        Ok(self.domains.clone())
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
