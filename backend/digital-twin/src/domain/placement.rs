use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::domain::{Coordinates, DomainError};

pub const MAX_BATCH_PLACEMENTS: usize = 200;

/// Where one sensor physically sits, in the same axes as a room's own position.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Placement {
    pub sensor_id: String,
    pub position: Coordinates,
}

/// One building's placement edits. Only `checked` builds it, so no later layer can skip validation.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct PlacementChanges {
    pub upsert: Vec<Placement>,
    pub delete: Vec<String>,
}

impl PlacementChanges {
    pub fn checked(upsert: Vec<Placement>, delete: Vec<String>) -> Result<Self, DomainError> {
        if upsert.len() + delete.len() > MAX_BATCH_PLACEMENTS {
            return Err(DomainError::Validation(format!(
                "A batch holds at most {MAX_BATCH_PLACEMENTS} placements"
            )));
        }

        let mut seen = HashSet::new();
        let mut once = |sensor_id: &str| -> Result<String, DomainError> {
            let sensor_id = sensor_id.trim();
            if sensor_id.is_empty() {
                return Err(DomainError::Validation(
                    "sensorId must not be blank".to_string(),
                ));
            }
            // Stored as a field name keyed by sensor id, and `.`/`$` would be read as a path there.
            if !sensor_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return Err(DomainError::Validation(format!(
                    "sensorId {sensor_id} may hold only letters, digits, '-' and '_'"
                )));
            }
            if !seen.insert(sensor_id.to_owned()) {
                return Err(DomainError::Validation(format!(
                    "Sensor {sensor_id} appears more than once in this batch"
                )));
            }
            Ok(sensor_id.to_owned())
        };

        let upsert = upsert
            .into_iter()
            .map(|placement| {
                let sensor_id = once(&placement.sensor_id)?;
                let position = &placement.position;
                if ![position.x, position.y, position.z]
                    .iter()
                    .all(|value| value.is_finite())
                {
                    return Err(DomainError::Validation(format!(
                        "Sensor {sensor_id} needs finite coordinates"
                    )));
                }
                Ok(Placement {
                    sensor_id,
                    ..placement
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        let delete = delete
            .iter()
            .map(|sensor_id| once(sensor_id))
            .collect::<Result<Vec<_>, _>>()?;

        Ok(Self { upsert, delete })
    }

    pub fn is_empty(&self) -> bool {
        self.upsert.is_empty() && self.delete.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Coordinates;

    fn at(x: f64) -> Coordinates {
        Coordinates { x, y: 0.0, z: 0.0 }
    }

    fn upserting(placements: Vec<Placement>) -> Result<PlacementChanges, DomainError> {
        PlacementChanges::checked(placements, Vec::new())
    }

    fn placement(sensor_id: &str, x: f64) -> Placement {
        Placement {
            sensor_id: sensor_id.to_owned(),
            position: at(x),
        }
    }

    #[test]
    fn a_batch_keeps_what_it_was_given() {
        let changes =
            PlacementChanges::checked(vec![placement("s1", 1.0)], vec!["s2".to_owned()]).unwrap();
        assert_eq!(changes.upsert, vec![placement("s1", 1.0)]);
        assert_eq!(changes.delete, ["s2"]);
    }

    #[test]
    fn coordinates_must_be_finite() {
        for broken in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let error = upserting(vec![placement("s1", broken)]).unwrap_err();
            assert!(matches!(error, DomainError::Validation(_)), "{broken}");
        }
    }

    #[test]
    fn a_sensor_id_must_not_be_blank() {
        let error = upserting(vec![placement("  ", 1.0)]).unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        let error = PlacementChanges::checked(Vec::new(), vec!["".to_owned()]).unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
    }

    #[test]
    fn a_sensor_id_is_limited_to_the_characters_mongo_can_key_a_field_by() {
        for bad in ["a.b", "$set", "with space", "quote\"d"] {
            let error = upserting(vec![placement(bad, 1.0)]).unwrap_err();
            assert!(matches!(error, DomainError::Validation(_)), "{bad}");
        }
        assert!(upserting(vec![placement("5c1e0b7a-9f2d-4c1e_8a61", 1.0)]).is_ok());
    }

    #[test]
    fn a_sensor_may_appear_only_once_in_a_batch() {
        let twice = upserting(vec![placement("s1", 1.0), placement("s1", 2.0)]).unwrap_err();
        assert!(matches!(twice, DomainError::Validation(_)));

        let both_ways =
            PlacementChanges::checked(vec![placement("s1", 1.0)], vec!["s1".to_owned()])
                .unwrap_err();
        assert!(matches!(both_ways, DomainError::Validation(_)));
    }

    #[test]
    fn a_batch_is_capped() {
        let too_many = (0..=MAX_BATCH_PLACEMENTS)
            .map(|i| placement(&format!("s{i}"), i as f64))
            .collect();
        let error = upserting(too_many).unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
    }

    #[test]
    fn an_empty_batch_is_allowed() {
        let changes = PlacementChanges::checked(Vec::new(), Vec::new()).unwrap();
        assert!(changes.is_empty());
    }
}
