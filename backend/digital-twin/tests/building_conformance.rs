use digital_twin::domain::Building;

const FIXTURE: &str = include_str!("../../../schemas/fixtures/building.json");

#[test]
fn the_shared_fixture_is_a_building_this_service_could_have_served() {
    let building: Building = serde_json::from_str(FIXTURE).expect("fixture parses");

    assert!(!building.id.is_empty());
    assert!(!building.name.is_empty());
    assert!(!building.domains.is_empty());
    assert_eq!(building.rooms.len(), 2);

    let room = &building.rooms[0];
    assert_eq!(room.name, "Aula Magna");
    assert!(room.capacity > 0.0);
    assert!(room.color.is_some());
    assert!(building.rooms[1].color.is_none());
}

// The consumers that read this payload are agent (Python) and the frontend
// (TypeScript), neither of which can share a Rust type. Round-tripping the fixture is
// what makes a renamed or dropped field fail here rather than in their parsers.
#[test]
fn no_field_the_other_languages_read_is_dropped_on_the_way_through() {
    let parsed: Building = serde_json::from_str(FIXTURE).expect("fixture parses");
    let round_tripped: serde_json::Value =
        serde_json::from_str(&serde_json::to_string(&parsed).expect("building serialises"))
            .expect("round trip parses");

    assert_eq!(
        round_tripped,
        serde_json::from_str::<serde_json::Value>(FIXTURE).expect("fixture parses as json"),
    );
}
