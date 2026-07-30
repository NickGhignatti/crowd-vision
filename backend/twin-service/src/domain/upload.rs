use serde::Serialize;

use super::Building;

#[derive(Debug, Clone)]
pub struct AcceptedUpload {
    pub id: String,
    pub building: Building,
    pub claims: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UploadStatus {
    Pending,
    Ready,
    Failed,
}
