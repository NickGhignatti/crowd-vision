use crate::kernel::ingest::Ingest;
use crate::kernel::ports::{ObservationEvents, SensorStore};
use crate::kernel::sensors::ROUTER;
use crate::types::error::DomainError;
use crate::types::sensor::Sensor;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use twin_schema::WifiObservations;

const TOTAL_DEVICE_COUNT: &str = "totalDeviceCount";
const RATIO_DEVICE_COUNT: &str = "ratioDeviceCount";

/// Checks a building's Wi-Fi tick, counts its phones per router room, then hands on the bytes.
pub struct Observations {
    pub events: Arc<dyn ObservationEvents>,
    pub sensors: Arc<dyn SensorStore>,
    pub ingest: Arc<Ingest>,
}

impl Observations {
    pub async fn accept(&self, body: &[u8]) -> Result<(), DomainError> {
        let tick: WifiObservations = serde_json::from_slice(body)
            .map_err(|error| DomainError::Validation(format!("wifi observations: {error}.")))?;
        let problems = tick.problems();
        if !problems.is_empty() {
            return Err(DomainError::Validation(problems.join(" ")));
        }
        let sensors = self.sensors.by_building(&tick.building_id).await?;
        let readings = room_readings(&tick, &sensors);
        if !readings.is_empty() {
            self.ingest.accept(&tick.building_id, &readings).await?;
        }
        Ok(self
            .events
            .publish_observations(&tick.building_id, body)
            .await?)
    }
}

/// Phones per router room, as readings; a phone counts once, in its loudest router's room.
fn room_readings(tick: &WifiObservations, sensors: &[Sensor]) -> Vec<Value> {
    let rooms: HashMap<&str, &str> = sensors
        .iter()
        .filter(|sensor| sensor.sensor_type == ROUTER)
        .filter_map(|sensor| Some((sensor.sensor_id.as_str(), sensor.room_id.as_deref()?)))
        .collect();

    let mut loudest: HashMap<&str, (i32, &str)> = HashMap::new();
    for phone in &tick.connected {
        let Some(&room) = rooms.get(phone.router.as_str()) else {
            continue;
        };
        let heard = (phone.signal, room);
        loudest
            .entry(phone.token.as_str())
            .and_modify(|best| *best = (*best).max(heard))
            .or_insert(heard);
    }

    let mut counts: BTreeMap<&str, u64> = tick
        .answered
        .iter()
        .filter_map(|router| Some((*rooms.get(router.as_str())?, 0)))
        .collect();
    for (_, room) in loudest.into_values() {
        *counts.entry(room).or_default() += 1;
    }

    let reading = |metric: &str, room: &str, value: u64| json!({ "type": metric, "roomId": room, "timestamp": tick.tick, metric: value });
    let mut readings: Vec<Value> = counts
        .iter()
        .map(|(room, count)| reading(TOTAL_DEVICE_COUNT, room, *count))
        .collect();
    if let Some(factor) = tick.devices_per_person {
        // Rounds up: flooring 0.4 of a person would report an occupied room as empty.
        readings.extend(counts.iter().map(|(room, count)| {
            reading(
                RATIO_DEVICE_COUNT,
                room,
                (*count as f64 / factor).ceil() as u64,
            )
        }));
    }
    readings
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{
        FakeAlerts, FakeBuildings, FakeFanout, FakeObservationEvents, FakePlugin, FakeReadings,
        FakeSensors, FakeThresholds, FixedClock,
    };
    use crate::kernel::ports::{
        Alerts, BuildingStore, Clock, Fanout, ReadingStore, ThresholdStore,
    };
    use crate::kernel::registry::PluginRegistry;

    const FIXTURE: &str = include_str!("../../../../schemas/fixtures/wifi-observations.json");
    const A: &str = "aaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbbbbbb";
    const C: &str = "cccccccccccccccc";

    fn cases(group: &str) -> Vec<Value> {
        let fixture: Value = serde_json::from_str(FIXTURE).expect("fixture parses");
        fixture[group].as_array().expect("fixture group").clone()
    }

    struct Harness {
        events: Arc<FakeObservationEvents>,
        readings: Arc<FakeReadings>,
        observations: Observations,
    }

    fn harness_with(
        events: FakeObservationEvents,
        sensors: FakeSensors,
        readings: FakeReadings,
    ) -> Harness {
        let events = Arc::new(events);
        let readings = Arc::new(readings);
        let registry = PluginRegistry::new(vec![
            Box::new(FakePlugin {
                key: TOTAL_DEVICE_COUNT,
            }),
            Box::new(FakePlugin {
                key: RATIO_DEVICE_COUNT,
            }),
        ])
        .unwrap();
        let ingest = Ingest {
            registry: Arc::new(registry),
            readings: readings.clone() as Arc<dyn ReadingStore>,
            thresholds: Arc::new(FakeThresholds::default()) as Arc<dyn ThresholdStore>,
            fanout: Arc::new(FakeFanout::default()) as Arc<dyn Fanout>,
            alerts: Arc::new(FakeAlerts::default()) as Arc<dyn Alerts>,
            buildings: Arc::new(FakeBuildings::default()) as Arc<dyn BuildingStore>,
            clock: Arc::new(FixedClock::default()) as Arc<dyn Clock>,
        };
        let observations = Observations {
            events: events.clone() as Arc<dyn ObservationEvents>,
            sensors: Arc::new(sensors) as Arc<dyn SensorStore>,
            ingest: Arc::new(ingest),
        };
        Harness {
            events,
            readings,
            observations,
        }
    }

    fn harness(sensors: &[(&str, &str, Option<&str>)]) -> Harness {
        harness_with(
            FakeObservationEvents::default(),
            building(sensors),
            FakeReadings::default(),
        )
    }

    /// Sensors of building b1, as (sensorId, sensorType, roomId).
    fn building(sensors: &[(&str, &str, Option<&str>)]) -> FakeSensors {
        let registered = sensors
            .iter()
            .map(|(id, kind, room)| Sensor {
                building_id: "b1".to_owned(),
                room_id: room.map(str::to_owned),
                sensor_id: (*id).to_owned(),
                name: (*id).to_owned(),
                sensor_type: (*kind).to_owned(),
                driver: None,
                endpoint: None,
            })
            .collect();
        FakeSensors {
            registered: std::sync::Mutex::new(registered),
            ..Default::default()
        }
    }

    fn tick(answered: &[&str], connected: &[(&str, &str, i32)], factor: Option<f64>) -> Vec<u8> {
        let mut body = json!({
            "buildingId": "b1",
            "tick": 1_761_300_000_000u64,
            "answered": answered,
            "connected": connected
                .iter()
                .map(|(token, router, signal)| json!({ "token": token, "router": router, "signal": signal }))
                .collect::<Vec<_>>(),
            "bursts": [],
        });
        if let Some(factor) = factor {
            body["devicesPerPerson"] = json!(factor);
        }
        body.to_string().into_bytes()
    }

    /// What reached the reading store, as (metric, room, value).
    fn stored(h: &Harness) -> Vec<(String, String, f64)> {
        let mut stored: Vec<_> = h
            .readings
            .inserted
            .lock()
            .unwrap()
            .iter()
            .map(|r| (r.metric.clone(), r.room_id.clone(), r.value))
            .collect();
        stored.sort_by(|a, b| a.partial_cmp(b).unwrap());
        stored
    }

    fn total(room: &str, value: f64) -> (String, String, f64) {
        (TOTAL_DEVICE_COUNT.to_owned(), room.to_owned(), value)
    }

    fn ratio(room: &str, value: f64) -> (String, String, f64) {
        (RATIO_DEVICE_COUNT.to_owned(), room.to_owned(), value)
    }

    #[tokio::test]
    async fn every_tick_the_fixture_accepts_is_published_byte_for_byte_under_its_building() {
        let h = harness(&[]);

        for case in cases("cases") {
            let body = case["body"].to_string().into_bytes();
            h.observations.accept(&body).await.expect("accepted");

            let building = case["body"]["buildingId"].as_str().unwrap().to_owned();
            assert_eq!(
                h.events.published.lock().unwrap().pop(),
                Some((building, body)),
                "{}",
                case["name"]
            );
        }
    }

    #[tokio::test]
    async fn every_tick_the_fixture_rejects_is_refused_and_never_published() {
        let h = harness(&[]);

        for case in cases("rejected") {
            let refused = h
                .observations
                .accept(case["body"].to_string().as_bytes())
                .await;

            assert!(
                matches!(refused, Err(DomainError::Validation(_))),
                "{}: {refused:?}",
                case["name"]
            );
        }
        assert!(h.events.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_body_that_is_not_json_is_a_validation_error() {
        let h = harness(&[]);

        let refused = h.observations.accept(b"not json").await;

        assert!(matches!(refused, Err(DomainError::Validation(_))));
    }

    #[tokio::test]
    async fn a_broker_that_refuses_the_tick_is_an_error_not_an_acceptance() {
        let h = harness_with(
            FakeObservationEvents {
                refuse: true,
                ..Default::default()
            },
            FakeSensors::default(),
            FakeReadings::default(),
        );
        let body = cases("cases")[0]["body"].to_string();

        let refused = h.observations.accept(body.as_bytes()).await;

        assert!(matches!(refused, Err(DomainError::Internal(_))));
    }

    #[tokio::test]
    async fn a_phone_two_routers_list_counts_once_in_the_louder_ones_room() {
        let h = harness(&[("r1", ROUTER, Some("lobby")), ("r2", ROUTER, Some("hall"))]);

        let body = tick(&["r1", "r2"], &[(A, "r1", -70), (A, "r2", -60)], None);
        h.observations.accept(&body).await.unwrap();

        assert_eq!(stored(&h), vec![total("hall", 1.0), total("lobby", 0.0)]);
    }

    #[tokio::test]
    async fn two_routers_in_one_room_count_its_phones_once() {
        let h = harness(&[("r1", ROUTER, Some("lobby")), ("r2", ROUTER, Some("lobby"))]);

        let body = tick(
            &["r1", "r2"],
            &[(A, "r1", -60), (A, "r2", -61), (B, "r2", -50)],
            None,
        );
        h.observations.accept(&body).await.unwrap();

        assert_eq!(stored(&h), vec![total("lobby", 2.0)]);
    }

    // A failed router's room was not measured: a zero there would read as a fresh empty room.
    #[tokio::test]
    async fn an_answered_empty_room_reports_zero_and_a_failed_routers_room_reports_nothing() {
        let h = harness(&[("r1", ROUTER, Some("lobby")), ("r2", ROUTER, Some("hall"))]);

        h.observations
            .accept(&tick(&["r1"], &[], None))
            .await
            .unwrap();

        assert_eq!(stored(&h), vec![total("lobby", 0.0)]);
    }

    #[tokio::test]
    async fn a_phone_on_an_outdoor_unknown_or_non_router_sensor_is_not_counted() {
        let h = harness(&[
            ("r1", ROUTER, Some("lobby")),
            ("out", ROUTER, None),
            ("t1", "thermometer", Some("hall")),
        ]);

        let body = tick(
            &["r1", "out"],
            &[(A, "out", -40), (B, "nowhere", -40), (C, "t1", -40)],
            None,
        );
        h.observations.accept(&body).await.unwrap();

        assert_eq!(stored(&h), vec![total("lobby", 0.0)]);
    }

    // Rounds up: flooring 0.4 of a person would report an occupied room as empty.
    #[tokio::test]
    async fn a_site_factor_adds_a_people_estimate_rounded_up() {
        let h = harness(&[("r1", ROUTER, Some("lobby")), ("r2", ROUTER, Some("hall"))]);

        let body = tick(
            &["r1", "r2"],
            &[(A, "r1", -60), (B, "r1", -60), (C, "r1", -60)],
            Some(2.5),
        );
        h.observations.accept(&body).await.unwrap();

        assert_eq!(
            stored(&h),
            vec![
                ratio("hall", 0.0),
                ratio("lobby", 2.0),
                total("hall", 0.0),
                total("lobby", 3.0),
            ]
        );
    }

    // aq-simulator and sensor-simulator build the same batch by hand; the fixture holds all three.
    #[test]
    fn the_counts_match_the_batch_the_ingest_fixture_pins() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../schemas/fixtures/ingest-batch.json"
        ))
        .unwrap();
        let pinned = fixture["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|case| case["producer"] == "telemetry")
            .expect("a case telemetry produces");
        let readings = pinned["body"]["readings"].as_array().unwrap();
        let room = readings[0]["roomId"].as_str().unwrap();
        let tokens: Vec<String> = (0..47).map(|n| format!("{n:016x}")).collect();
        let tick: WifiObservations = serde_json::from_value(json!({
            "buildingId": pinned["body"]["buildingId"],
            "tick": readings[0]["timestamp"],
            "answered": ["r1"],
            "connected": tokens
                .iter()
                .map(|token| json!({ "token": token, "router": "r1", "signal": -60 }))
                .collect::<Vec<_>>(),
            "bursts": [],
            "devicesPerPerson": 2.0,
        }))
        .unwrap();
        let routers = building(&[("r1", ROUTER, Some(room))])
            .registered
            .into_inner()
            .unwrap();

        assert_eq!(&room_readings(&tick, &routers), readings);
    }

    #[tokio::test]
    async fn a_count_is_stamped_with_the_tick_and_its_building() {
        let h = harness(&[("r1", ROUTER, Some("lobby"))]);

        h.observations
            .accept(&tick(&["r1"], &[(A, "r1", -60)], None))
            .await
            .unwrap();

        let inserted = h.readings.inserted.lock().unwrap();
        assert_eq!(inserted.len(), 1);
        assert_eq!(inserted[0].building_id, "b1");
        assert_eq!(inserted[0].ts_ms, 1_761_300_000_000);
    }

    #[tokio::test]
    async fn a_building_with_no_router_in_a_room_still_publishes_its_tick() {
        let h = harness(&[]);

        h.observations
            .accept(&tick(&["r1"], &[(A, "r1", -60)], None))
            .await
            .unwrap();

        assert!(stored(&h).is_empty());
        assert_eq!(h.events.published.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_count_that_cannot_be_stored_is_an_error_and_the_tick_is_not_published() {
        for (sensors, readings) in [
            (
                FakeSensors {
                    refuse: true,
                    ..Default::default()
                },
                FakeReadings::default(),
            ),
            (
                building(&[("r1", ROUTER, Some("lobby"))]),
                FakeReadings {
                    refuse: true,
                    ..Default::default()
                },
            ),
        ] {
            let h = harness_with(FakeObservationEvents::default(), sensors, readings);

            let refused = h.observations.accept(&tick(&["r1"], &[], None)).await;

            assert!(
                matches!(refused, Err(DomainError::Internal(_))),
                "{refused:?}"
            );
            assert!(h.events.published.lock().unwrap().is_empty());
        }
    }
}
