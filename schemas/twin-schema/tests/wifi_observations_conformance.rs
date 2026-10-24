use twin_schema::{WIFI_OBSERVATIONS_TOPIC, WifiObservations};

const FIXTURE: &str = include_str!("../../fixtures/wifi-observations.json");

#[test]
fn every_tick_round_trips_through_the_type_unchanged() {
    for case in cases() {
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
fn a_burst_names_each_router_it_was_heard_by_with_its_signal() {
    let first = cases().remove(0);
    let tick: WifiObservations = serde_json::from_value(first["body"].clone()).expect("parses");

    assert_eq!(
        tick.bursts[0]
            .heard
            .get("e6f70819-2a3b-4c4d-8e5f-60718293a4b5"),
        Some(&-58)
    );
}

#[test]
fn the_topic_is_named_after_what_it_carries() {
    assert_eq!(WIFI_OBSERVATIONS_TOPIC, "wifi-observations");
}

fn cases() -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture["cases"].as_array().expect("cases").clone()
}
