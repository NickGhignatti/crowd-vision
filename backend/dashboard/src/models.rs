pub use telemetry_schema::{MetricContract, MetricsDiscoveryResponse};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct PreferenceDocument {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,
    pub building_id: String,
    pub allowed_columns: Vec<String>,
}
