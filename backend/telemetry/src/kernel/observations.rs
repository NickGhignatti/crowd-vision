use crate::kernel::ports::ObservationEvents;
use crate::types::error::DomainError;
use std::sync::Arc;
use twin_schema::WifiObservations;

/// Checks a building's Wi-Fi tick against its contract, then hands on the bytes received.
pub struct Observations {
    pub events: Arc<dyn ObservationEvents>,
}

impl Observations {
    pub async fn accept(&self, body: &[u8]) -> Result<(), DomainError> {
        let tick: WifiObservations = serde_json::from_slice(body)
            .map_err(|error| DomainError::Validation(format!("wifi observations: {error}.")))?;
        let problems = tick.problems();
        if !problems.is_empty() {
            return Err(DomainError::Validation(problems.join(" ")));
        }
        Ok(self
            .events
            .publish_observations(&tick.building_id, body)
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::FakeObservationEvents;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../../../schemas/fixtures/wifi-observations.json");

    fn cases(group: &str) -> Vec<Value> {
        let fixture: Value = serde_json::from_str(FIXTURE).expect("fixture parses");
        fixture[group].as_array().expect("fixture group").clone()
    }

    fn observations(events: FakeObservationEvents) -> (Arc<FakeObservationEvents>, Observations) {
        let events = Arc::new(events);
        let observations = Observations {
            events: events.clone() as Arc<dyn ObservationEvents>,
        };
        (events, observations)
    }

    #[tokio::test]
    async fn every_tick_the_fixture_accepts_is_published_byte_for_byte_under_its_building() {
        let (events, observations) = observations(FakeObservationEvents::default());

        for case in cases("cases") {
            let body = case["body"].to_string().into_bytes();
            observations.accept(&body).await.expect("accepted");

            let building = case["body"]["buildingId"].as_str().unwrap().to_owned();
            assert_eq!(
                events.published.lock().unwrap().pop(),
                Some((building, body)),
                "{}",
                case["name"]
            );
        }
    }

    #[tokio::test]
    async fn every_tick_the_fixture_rejects_is_refused_and_never_published() {
        let (events, observations) = observations(FakeObservationEvents::default());

        for case in cases("rejected") {
            let refused = observations
                .accept(case["body"].to_string().as_bytes())
                .await;

            assert!(
                matches!(refused, Err(DomainError::Validation(_))),
                "{}: {refused:?}",
                case["name"]
            );
        }
        assert!(events.published.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_body_that_is_not_json_is_a_validation_error() {
        let (_, observations) = observations(FakeObservationEvents::default());

        let refused = observations.accept(b"not json").await;

        assert!(matches!(refused, Err(DomainError::Validation(_))));
    }

    #[tokio::test]
    async fn a_broker_that_refuses_the_tick_is_an_error_not_an_acceptance() {
        let (_, observations) = observations(FakeObservationEvents {
            refuse: true,
            ..Default::default()
        });
        let body = cases("cases")[0]["body"].to_string();

        let refused = observations.accept(body.as_bytes()).await;

        assert!(matches!(refused, Err(DomainError::Internal(_))));
    }
}
