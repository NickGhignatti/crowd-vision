use twin_schema::{MAX_BURSTS, MAX_CONNECTED, WIFI_OBSERVATIONS_TOPIC, WifiObservations};

const FIXTURE: &str = include_str!("../../fixtures/wifi-observations.json");

#[test]
fn every_tick_round_trips_through_the_type_unchanged() {
    for case in cases("cases") {
        let tick: WifiObservations = serde_json::from_value(case["body"].clone())
            .unwrap_or_else(|error| panic!("{}: {error}", case["name"]));

        assert_eq!(
            serde_json::to_value(&tick).expect("serialises"),
            case["body"],
            "{}",
            case["name"]
        );
    }
}

#[test]
fn every_tick_the_fixture_accepts_breaks_no_rule() {
    for case in cases("cases") {
        let tick: WifiObservations = serde_json::from_value(case["body"].clone()).expect("parses");

        assert_eq!(tick.problems(), Vec::<String>::new(), "{}", case["name"]);
    }
}

// Telemetry publishes the bytes it received, so whatever the type lets through reaches Kafka.
#[test]
fn every_tick_the_fixture_rejects_is_refused_by_the_type_or_its_rules() {
    for case in cases("rejected") {
        let refused = serde_json::from_value::<WifiObservations>(case["body"].clone())
            .map_or(true, |tick| !tick.problems().is_empty());

        assert!(
            refused,
            "{} accepted, but it must be refused: {}",
            case["name"], case["reason"]
        );
    }
}

#[test]
fn a_tick_over_its_row_limits_is_refused() {
    let mut tick = first_tick();
    tick.connected = vec![tick.connected[0].clone(); MAX_CONNECTED + 1];
    tick.bursts = vec![tick.bursts[0].clone(); MAX_BURSTS + 1];

    assert_eq!(tick.problems().len(), 2, "{:?}", tick.problems());
}

#[test]
fn a_burst_names_each_router_it_was_heard_by_with_its_signal() {
    assert_eq!(
        first_tick().bursts[0]
            .heard
            .get("e6f70819-2a3b-4c4d-8e5f-60718293a4b5"),
        Some(&-58)
    );
}

#[test]
fn the_topic_is_named_after_what_it_carries() {
    assert_eq!(WIFI_OBSERVATIONS_TOPIC, "wifi-observations");
}

fn first_tick() -> WifiObservations {
    serde_json::from_value(cases("cases").remove(0)["body"].clone()).expect("parses")
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture[group]
        .as_array()
        .unwrap_or_else(|| panic!("the fixture has a {group} array"))
        .clone()
}
