#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetricFieldContract {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub required: bool,
    pub description: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MetricContract {
    pub metric_key: String,
    pub label: String,
    pub interface_name: String,
    pub unit: Option<String>,
    pub fields: Vec<MetricFieldContract>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_service: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceMetricsContract {
    pub service: String,
    pub metrics: Vec<MetricContract>,
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum MetricsDiscoveryResponse {
    ServiceContract(ServiceMetricsContract),
    Metrics(Vec<MetricContract>),
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct PreferenceDocument {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<mongodb::bson::oid::ObjectId>,
    pub building_id: String,
    pub allowed_columns: Vec<String>,
}
