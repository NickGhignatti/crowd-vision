use twin_schema::{Devices, building_of_devices_channel, devices_channel};

const FIXTURE: &str = include_str!("../../fixtures/devices.json");

#[test]
fn every_tick_round_trips_through_the_type_unchanged() {
    for case in cases("cases") {
        let devices: Devices = serde_json::from_value(case["body"].clone())
            .unwrap_or_else(|error| panic!("{}: {error}", case["name"]));

        assert_eq!(
            serde_json::to_value(&devices).expect("serialises"),
            case["body"],
            "{}",
            case["name"]
        );
    }
}

// Socket routes only what parses, so whatever the type lets through reaches a browser.
#[test]
fn every_tick_the_fixture_rejects_is_refused_by_the_type() {
    for case in cases("rejected") {
        assert!(
            serde_json::from_value::<Devices>(case["body"].clone()).is_err(),
            "{} accepted, but it must be refused: {}",
            case["name"],
            case["reason"]
        );
    }
}

#[test]
fn every_tick_names_the_building_of_its_own_channel() {
    for case in cases("cases") {
        let devices: Devices = serde_json::from_value(case["body"].clone()).expect("parses");
        let channel = devices_channel(&devices.building_id);

        assert_eq!(
            building_of_devices_channel(&channel),
            Some(devices.building_id.as_str())
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
