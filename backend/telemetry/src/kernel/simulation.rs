use crate::kernel::devices::DeviceCatalog;
use crate::kernel::ports::{BuildingStore, DispatchError, SensorStore, SimulatorControl};
use crate::types::error::DomainError;
use crate::types::sensor::Sensor;
use crate::types::simulation::{SimulatedSensor, SimulationPlan, SimulatorSpec};
use futures::future::join_all;
use std::sync::Arc;

/// Starts, stops and reports the simulators that stand in for a building's sensors.
pub struct Simulation {
    simulators: Vec<SimulatorSpec>,
    control: Arc<dyn SimulatorControl>,
    sensors: Arc<dyn SensorStore>,
    buildings: Arc<dyn BuildingStore>,
}

impl Simulation {
    /// Refuses a kind no device has, or one kind given to two simulators: it would double every reading.
    pub fn new(
        simulators: Vec<SimulatorSpec>,
        control: Arc<dyn SimulatorControl>,
        sensors: Arc<dyn SensorStore>,
        buildings: Arc<dyn BuildingStore>,
        devices: &DeviceCatalog,
    ) -> Result<Self, String> {
        for (index, simulator) in simulators.iter().enumerate() {
            for kind in &simulator.kinds {
                if devices.get(kind).is_none() {
                    return Err(format!(
                        "simulator {} claims unknown device kind {kind}",
                        simulator.name
                    ));
                }
                if let Some(other) = simulators[..index]
                    .iter()
                    .find(|other| other.kinds.contains(kind))
                {
                    return Err(format!(
                        "device kind {kind} is claimed by both {} and {}",
                        other.name, simulator.name
                    ));
                }
            }
        }
        Ok(Self {
            simulators,
            control,
            sensors,
            buildings,
        })
    }

    /// Each configured simulator's share of the sensors, and the ids no simulator takes.
    pub fn plan(&self, sensors: &[Sensor]) -> SimulationPlan {
        let mut plan = SimulationPlan {
            by_simulator: self
                .simulators
                .iter()
                .map(|simulator| (simulator.name.clone(), Vec::new()))
                .collect(),
            unsimulated: Vec::new(),
        };
        for sensor in sensors {
            let owner = self
                .simulators
                .iter()
                .find(|simulator| simulator.kinds.contains(&sensor.sensor_type));
            match (owner, &sensor.room_id) {
                (Some(simulator), Some(room_id)) => plan
                    .by_simulator
                    .entry(simulator.name.clone())
                    .or_default()
                    .push(SimulatedSensor {
                        sensor_id: sensor.sensor_id.clone(),
                        sensor_type: sensor.sensor_type.clone(),
                        room_id: room_id.clone(),
                    }),
                _ => plan.unsimulated.push(sensor.sensor_id.clone()),
            }
        }
        plan
    }

    /// Sends every configured simulator its share of the building's sensors, even an empty one.
    pub async fn start(&self, building_id: &str) -> Result<SimulationPlan, DomainError> {
        self.configured()?;
        if self.buildings.names_of(building_id).await?.is_none() {
            return Err(DomainError::NotFound(format!(
                "building {building_id} is not registered."
            )));
        }
        let plan = self.plan(&self.sensors.by_building(building_id).await?);
        let results = join_all(plan.by_simulator.iter().map(|(name, sensors)| async move {
            (
                name.as_str(),
                self.control.start(name, building_id, sensors).await,
            )
        }))
        .await;
        all_answered("start", building_id, results)?;
        Ok(plan)
    }

    pub async fn stop(&self, building_id: &str) -> Result<(), DomainError> {
        self.configured()?;
        let results = join_all(self.simulators.iter().map(|simulator| async move {
            (
                simulator.name.as_str(),
                self.control.stop(&simulator.name, building_id).await,
            )
        }))
        .await;
        all_answered("stop", building_id, results)
    }

    /// True when any simulator runs the building; one that does not answer is not running it.
    pub async fn is_running(&self, building_id: &str) -> Result<bool, DomainError> {
        let answers = join_all(self.simulators.iter().map(|simulator| async move {
            match self.control.is_running(&simulator.name, building_id).await {
                Ok(running) => running,
                Err(error) => {
                    log::warn!("simulator {} status unknown: {error:?}", simulator.name);
                    false
                }
            }
        }))
        .await;
        Ok(answers.into_iter().any(|running| running))
    }

    fn configured(&self) -> Result<(), DomainError> {
        match self.simulators.is_empty() {
            true => Err(DomainError::NotFound(
                "no simulator is configured.".to_owned(),
            )),
            false => Ok(()),
        }
    }
}

fn all_answered(
    action: &str,
    building_id: &str,
    results: Vec<(&str, Result<(), DispatchError>)>,
) -> Result<(), DomainError> {
    let failed: Vec<&str> = results
        .into_iter()
        .filter_map(|(name, result)| {
            let error = result.err()?;
            log::error!("simulator {name} did not {action} building {building_id}: {error:?}");
            Some(name)
        })
        .collect();
    match failed.is_empty() {
        true => Ok(()),
        false => Err(DomainError::BadGateway(format!(
            "simulator {} did not {action}.",
            failed.join(", ")
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::devices::DeviceCatalog;
    use crate::kernel::fakes::{FakeBuildings, FakePlugin, FakeSensors, FakeSimulators};
    use crate::kernel::ports::SimulatorControl;
    use crate::kernel::registry::PluginRegistry;
    use crate::types::building::{RegisteredBuilding, Room};
    use crate::types::device::DeviceKind;
    use crate::types::error::DomainError;
    use crate::types::sensor::Sensor;
    use crate::types::simulation::{SimulatedSensor, SimulatorSpec};
    use std::sync::{Arc, Mutex};

    const SENSOR_SIM: &str = "sensor-simulator";
    const AQ_SIM: &str = "aq-simulator";

    fn devices() -> DeviceCatalog {
        let metrics = [
            "temperature",
            "peopleCount",
            "airQuality",
            "totalDeviceCount",
            "ratioDeviceCount",
        ];
        let registry = PluginRegistry::new(
            metrics
                .iter()
                .map(|&key| Box::new(FakePlugin { key }) as Box<_>)
                .collect(),
        )
        .unwrap();
        let device = |key, metrics| DeviceKind {
            key,
            label: key,
            metrics,
        };
        DeviceCatalog::new(
            vec![
                device("router", &["totalDeviceCount", "ratioDeviceCount"]),
                device("temperature", &["temperature"]),
                device("airQuality", &["airQuality"]),
                device("peopleCount", &["peopleCount"]),
            ],
            &registry,
        )
        .unwrap()
    }

    fn spec(name: &str, kinds: &[&str]) -> SimulatorSpec {
        SimulatorSpec {
            name: name.to_owned(),
            kinds: kinds.iter().map(|kind| (*kind).to_owned()).collect(),
        }
    }

    fn both() -> Vec<SimulatorSpec> {
        vec![
            spec(SENSOR_SIM, &["temperature", "peopleCount"]),
            spec(AQ_SIM, &["airQuality"]),
        ]
    }

    fn sensor(id: &str, kind: &str, room: Option<&str>) -> Sensor {
        Sensor {
            building_id: "b1".to_owned(),
            room_id: room.map(str::to_owned),
            sensor_id: id.to_owned(),
            name: id.to_owned(),
            sensor_type: kind.to_owned(),
            driver: None,
            endpoint: None,
        }
    }

    fn simulated(id: &str, kind: &str, room: &str) -> SimulatedSensor {
        SimulatedSensor {
            sensor_id: id.to_owned(),
            sensor_type: kind.to_owned(),
            room_id: room.to_owned(),
        }
    }

    fn build(
        simulators: Vec<SimulatorSpec>,
        sensors: Vec<Sensor>,
        control: Arc<FakeSimulators>,
    ) -> Result<Simulation, String> {
        let buildings = FakeBuildings::default();
        buildings.upserted.lock().unwrap().push(RegisteredBuilding {
            id: "b1".to_owned(),
            name: "HQ".to_owned(),
            rooms: vec![Room {
                id: "r1".to_owned(),
                name: "Lab".to_owned(),
            }],
        });
        let store = FakeSensors {
            registered: Mutex::new(sensors),
            ..Default::default()
        };
        Simulation::new(
            simulators,
            control as Arc<dyn SimulatorControl>,
            Arc::new(store),
            Arc::new(buildings),
            &devices(),
        )
    }

    struct Harness {
        control: Arc<FakeSimulators>,
        simulation: Simulation,
    }

    fn harness(
        simulators: Vec<SimulatorSpec>,
        sensors: Vec<Sensor>,
        control: FakeSimulators,
    ) -> Harness {
        let control = Arc::new(control);
        let simulation = build(simulators, sensors, control.clone()).expect("valid simulators");
        Harness {
            control,
            simulation,
        }
    }

    fn started(h: &Harness) -> Vec<(String, String, Vec<SimulatedSensor>)> {
        let mut started = h.control.started.lock().unwrap().clone();
        started.sort_by(|a, b| a.0.cmp(&b.0));
        started
    }

    fn stopped(h: &Harness) -> Vec<(String, String)> {
        let mut stopped = h.control.stopped.lock().unwrap().clone();
        stopped.sort();
        stopped
    }

    #[test]
    fn a_thermostat_and_a_people_counter_go_to_the_simulator_that_claims_them() {
        let h = harness(both(), vec![], FakeSimulators::default());
        let plan = h.simulation.plan(&[
            sensor("t1", "temperature", Some("r1")),
            sensor("p1", "peopleCount", Some("r1")),
        ]);
        assert_eq!(
            plan.by_simulator[SENSOR_SIM],
            vec![
                simulated("t1", "temperature", "r1"),
                simulated("p1", "peopleCount", "r1"),
            ]
        );
        assert!(plan.by_simulator[AQ_SIM].is_empty());
    }

    #[test]
    fn an_air_quality_station_goes_to_the_other_simulator() {
        let h = harness(both(), vec![], FakeSimulators::default());
        let plan = h.simulation.plan(&[sensor("a1", "airQuality", Some("r2"))]);
        assert_eq!(
            plan.by_simulator[AQ_SIM],
            vec![simulated("a1", "airQuality", "r2")]
        );
        assert!(plan.by_simulator[SENSOR_SIM].is_empty());
    }

    #[test]
    fn a_router_is_sent_to_no_simulator() {
        let h = harness(both(), vec![], FakeSimulators::default());
        let plan = h.simulation.plan(&[sensor("rt1", "router", Some("r1"))]);
        assert!(plan.by_simulator.values().all(Vec::is_empty));
        assert_eq!(plan.unsimulated, vec!["rt1".to_owned()]);
    }

    #[test]
    fn an_outdoor_sensor_is_never_sent() {
        let h = harness(both(), vec![], FakeSimulators::default());
        let plan = h.simulation.plan(&[sensor("t1", "temperature", None)]);
        assert!(plan.by_simulator.values().all(Vec::is_empty));
        assert_eq!(plan.unsimulated, vec!["t1".to_owned()]);
    }

    #[tokio::test]
    async fn every_configured_simulator_is_told_even_with_no_sensors() {
        let h = harness(
            both(),
            vec![sensor("t1", "temperature", Some("r1"))],
            FakeSimulators::default(),
        );
        h.simulation.start("b1").await.unwrap();
        assert_eq!(
            started(&h),
            vec![
                (AQ_SIM.to_owned(), "b1".to_owned(), vec![]),
                (
                    SENSOR_SIM.to_owned(),
                    "b1".to_owned(),
                    vec![simulated("t1", "temperature", "r1")],
                ),
            ]
        );
    }

    #[tokio::test]
    async fn starting_an_unregistered_building_is_not_found_and_calls_no_simulator() {
        let h = harness(both(), vec![], FakeSimulators::default());
        let error = h.simulation.start("nope").await.unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
        assert!(started(&h).is_empty());
    }

    #[tokio::test]
    async fn with_no_simulator_configured_start_and_stop_are_not_found_and_nothing_runs() {
        let h = harness(vec![], vec![], FakeSimulators::default());
        let start = h.simulation.start("b1").await.unwrap_err();
        let stop = h.simulation.stop("b1").await.unwrap_err();
        assert!(matches!(start, DomainError::NotFound(_)));
        assert!(matches!(stop, DomainError::NotFound(_)));
        assert!(!h.simulation.is_running("b1").await.unwrap());
    }

    #[tokio::test]
    async fn one_failing_simulator_does_not_keep_the_others_stale() {
        let h = harness(
            both(),
            vec![sensor("a1", "airQuality", Some("r1"))],
            FakeSimulators {
                failing: vec![SENSOR_SIM.to_owned()],
                ..Default::default()
            },
        );
        let error = h.simulation.start("b1").await.unwrap_err();
        assert!(matches!(error, DomainError::BadGateway(_)));
        assert_eq!(
            started(&h),
            vec![(
                AQ_SIM.to_owned(),
                "b1".to_owned(),
                vec![simulated("a1", "airQuality", "r1")],
            )]
        );
    }

    #[tokio::test]
    async fn stop_reaches_every_simulator() {
        let h = harness(both(), vec![], FakeSimulators::default());
        h.simulation.stop("b1").await.unwrap();
        assert_eq!(
            stopped(&h),
            vec![
                (AQ_SIM.to_owned(), "b1".to_owned()),
                (SENSOR_SIM.to_owned(), "b1".to_owned()),
            ]
        );
    }

    #[tokio::test]
    async fn stop_tries_every_simulator_before_failing() {
        let h = harness(
            both(),
            vec![],
            FakeSimulators {
                unreachable: vec![SENSOR_SIM.to_owned()],
                ..Default::default()
            },
        );
        let error = h.simulation.stop("b1").await.unwrap_err();
        assert!(matches!(error, DomainError::BadGateway(_)));
        assert_eq!(stopped(&h), vec![(AQ_SIM.to_owned(), "b1".to_owned())]);
    }

    #[tokio::test]
    async fn a_building_runs_when_any_simulator_runs_it() {
        let h = harness(
            both(),
            vec![],
            FakeSimulators {
                running: vec![AQ_SIM.to_owned()],
                ..Default::default()
            },
        );
        assert!(h.simulation.is_running("b1").await.unwrap());
    }

    #[tokio::test]
    async fn an_unreachable_simulator_counts_as_not_running() {
        let h = harness(
            both(),
            vec![],
            FakeSimulators {
                unreachable: vec![SENSOR_SIM.to_owned()],
                ..Default::default()
            },
        );
        assert!(!h.simulation.is_running("b1").await.unwrap());
    }

    #[test]
    fn a_kind_no_device_has_is_refused() {
        let error = build(
            vec![spec(SENSOR_SIM, &["humidity"])],
            vec![],
            Arc::default(),
        )
        .err()
        .expect("refused");
        assert!(error.contains("humidity"), "{error}");
    }

    #[test]
    fn a_kind_claimed_by_two_simulators_is_refused() {
        let error = build(
            vec![
                spec(SENSOR_SIM, &["temperature"]),
                spec(AQ_SIM, &["temperature"]),
            ],
            vec![],
            Arc::default(),
        )
        .err()
        .expect("refused");
        assert!(error.contains("temperature"), "{error}");
    }
}
