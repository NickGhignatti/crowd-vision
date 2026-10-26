use twin_schema::EstimatedOccupancy;

const FIXTURE: &str = include_str!("../../fixtures/estimated-occupancy.json");

#[test]
fn every_tick_round_trips_through_the_type_unchanged() {
    for case in cases("cases") {
        let occupancy: EstimatedOccupancy = serde_json::from_value(case["body"].clone())
            .unwrap_or_else(|error| panic!("{}: {error}", case["name"]));

        assert_eq!(
            serde_json::to_value(&occupancy).expect("serialises"),
            case["body"],
            "{}",
            case["name"]
        );
    }
}

// Telemetry stores what parses, so whatever the type lets through becomes history.
#[test]
fn every_tick_the_fixture_rejects_is_refused_by_the_type() {
    for case in cases("rejected") {
        assert!(
            serde_json::from_value::<EstimatedOccupancy>(case["body"].clone()).is_err(),
            "{} accepted, but it must be refused: {}",
            case["name"],
            case["reason"]
        );
    }
}

fn cases(group: &str) -> Vec<serde_json::Value> {
    let fixture: serde_json::Value = serde_json::from_str(FIXTURE).expect("fixture parses");
    fixture[group]
        .as_array()
        .unwrap_or_else(|| panic!("the fixture has a {group} array"))
        .clone()
}
