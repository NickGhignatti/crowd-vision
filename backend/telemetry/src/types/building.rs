use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: String,
    pub name: String,
}

impl PartialEq for Room {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RegisteredBuilding {
    pub id: String,
    pub name: String,
    pub rooms: Vec<Room>,
}

/// A registered building's display names: its own, and each room's keyed by room id.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BuildingNames {
    pub name: String,
    pub rooms: HashMap<String, String>,
}

impl RegisteredBuilding {
    pub fn names(&self) -> BuildingNames {
        BuildingNames {
            name: self.name.clone(),
            rooms: self
                .rooms
                .iter()
                .map(|room| (room.id.clone(), room.name.clone()))
                .collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_room_eq() {
        let room1 = Room {
            id: "room1".to_string(),
            name: "Room 1".to_string(),
        };
        let room2 = Room {
            id: "room1".to_string(),
            name: "Room 2".to_string(),
        };
        assert_eq!(room1, room2);
    }

    #[test]
    fn a_buildings_names_key_each_room_by_its_id() {
        let building = RegisteredBuilding {
            id: "b1".to_string(),
            name: "HQ".to_string(),
            rooms: vec![Room {
                id: "r1".to_string(),
                name: "Lab 1".to_string(),
            }],
        };
        let names = building.names();
        assert_eq!(names.name, "HQ");
        assert_eq!(names.rooms["r1"], "Lab 1");
    }
}
