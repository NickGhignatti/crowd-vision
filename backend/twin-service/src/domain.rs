pub mod building;
pub mod error;
pub mod identity;
pub mod upload;

pub use building::{
    Building, Coordinates, Dimensions, DimensionsInput, PositionInput, Room,
    normalize_building_name, normalize_room_name, validate_capacity,
};
pub use error::DomainError;
pub use upload::{AcceptedUpload, UploadStatus};
