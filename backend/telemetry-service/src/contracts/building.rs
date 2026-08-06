use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: String,
    pub name: String,
    pub rooms: Vec<Room>,
    pub domains: Vec<String>,
}

impl PartialEq for Building {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
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
    fn test_building_eq() {
        let building1 = Building {
            id: "building1".to_string(),
            name: "Building 1".to_string(),
            rooms: vec![],
            domains: vec![],
        };
        let building2 = Building {
            id: "building1".to_string(),
            name: "Building 2".to_string(),
            rooms: vec![],
            domains: vec![],
        };
        assert_eq!(building1, building2);
    }
}
