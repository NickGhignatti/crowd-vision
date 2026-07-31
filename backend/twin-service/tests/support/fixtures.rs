use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde_json::{Value, json};

pub fn admin_of(domain: &str) -> String {
    BASE64.encode(
        json!({
            "sub": "u1",
            "accountName": "tester",
            "memberships": [{ "domain": domain, "role": "business_admin" }]
        })
        .to_string(),
    )
}

pub fn member_of(domain: &str) -> String {
    BASE64.encode(
        json!({
            "sub": "u1",
            "accountName": "tester",
            "memberships": [{ "domain": domain, "role": "standard_customer" }]
        })
        .to_string(),
    )
}

pub fn token() -> String {
    member_of("test-domain")
}

pub fn editor_token() -> String {
    admin_of("test-domain")
}

pub fn mock_building() -> Value {
    building_with(json!({ "width": 10, "height": 10, "depth": 10 }))
}

pub fn building_with(dimensions: Value) -> Value {
    json!({
        "name": "Engineering Block",
        "domains": ["test-domain"],
        "rooms": [{
            "id": "Room-101",
            "name": "Room 101",
            "capacity": 20,
            "position": { "x": 0, "y": 0, "z": 0 },
            "dimensions": dimensions,
            "color": "#ffffff"
        }]
    })
}

pub fn building_with_n_rooms(name: &str, domain: &str, rooms: usize) -> Value {
    let rooms: Vec<Value> = (0..rooms)
        .map(|i| {
            json!({
                "id": format!("Room-{i}"),
                "name": format!("Room {i}"),
                "capacity": 20,
                "position": { "x": (i as f64) * 10.0, "y": 0, "z": 0 },
                "dimensions": { "width": 10, "height": 10, "depth": 10 },
                "color": "#ffffff"
            })
        })
        .collect();
    json!({
        "name": name,
        "domains": [domain],
        "rooms": rooms
    })
}
