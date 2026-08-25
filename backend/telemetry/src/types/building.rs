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

#[derive(Debug, Clone, PartialEq)]
pub struct RegisteredBuilding {
    pub id: String,
    pub name: String,
    pub rooms: Vec<Room>,
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
}
