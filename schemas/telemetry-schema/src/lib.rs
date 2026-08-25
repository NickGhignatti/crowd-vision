pub mod alerts;
pub mod telemetry;

pub use alerts::{ALERTS_DLQ_TOPIC, ALERTS_TOPIC, AlertEvent, BoundDirection};
pub use telemetry::{
    FILTERED_CHANNEL_PATTERN, FILTERED_CHANNEL_PREFIX, RAW_CHANNEL, TelemetryEnvelope,
    TelemetryReading, building_of_filtered_channel, filtered_channel,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricFieldContract {
    pub name: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionParameterContract {
    pub name: String,
    #[serde(rename = "type")]
    pub parameter_type: String,
    pub required: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionContract {
    pub name: String,
    pub label: String,
    pub parameters: Vec<ActionParameterContract>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricContract {
    pub metric_key: String,
    pub label: String,
    pub interface_name: String,
    pub unit: Option<String>,
    pub fields: Vec<MetricFieldContract>,
    #[serde(default)]
    pub actions: Vec<ActionContract>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_service: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceMetricsContract {
    pub service: String,
    pub metrics: Vec<MetricContract>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum MetricsDiscoveryResponse {
    ServiceContract(ServiceMetricsContract),
    Metrics(Vec<MetricContract>),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn field(name: &str) -> MetricFieldContract {
        MetricFieldContract {
            name: name.to_owned(),
            field_type: "Finite".to_owned(),
            required: true,
            description: None,
        }
    }

    fn metric() -> MetricContract {
        MetricContract {
            metric_key: "temperature".to_owned(),
            label: "Temperature".to_owned(),
            interface_name: "ITemperature".to_owned(),
            unit: Some("C".to_owned()),
            fields: vec![field("temperature")],
            actions: vec![],
            source_service: None,
        }
    }

    #[test]
    fn a_metric_serialises_with_the_camel_case_names_the_frontend_reads() {
        let body = serde_json::to_value(metric()).unwrap();
        assert_eq!(body["metricKey"], "temperature");
        assert_eq!(body["interfaceName"], "ITemperature");
        assert_eq!(body["fields"][0]["type"], "Finite");
    }

    #[test]
    fn an_absent_source_service_is_omitted_but_empty_actions_stay_an_array() {
        let body = serde_json::to_value(metric()).unwrap();
        assert!(body.get("sourceService").is_none());
        assert_eq!(body["actions"], json!([]));
    }

    #[test]
    fn a_catalog_without_an_actions_field_still_parses() {
        let raw = json!({
            "metricKey": "occupancy", "label": "Occupancy",
            "interfaceName": "IOccupancy", "unit": null, "fields": []
        });
        let decoded: MetricContract = serde_json::from_value(raw).unwrap();
        assert!(decoded.actions.is_empty());
    }

    #[test]
    fn a_service_contract_round_trips() {
        let contract = ServiceMetricsContract {
            service: "telemetry".to_owned(),
            metrics: vec![metric()],
        };
        let encoded = serde_json::to_string(&contract).unwrap();
        let decoded: ServiceMetricsContract = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded, contract);
    }

    #[test]
    fn a_service_shaped_body_decodes_as_the_service_variant() {
        let raw = json!({ "service": "telemetry", "metrics": [] });
        let decoded: MetricsDiscoveryResponse = serde_json::from_value(raw).unwrap();
        assert!(matches!(
            decoded,
            MetricsDiscoveryResponse::ServiceContract(_)
        ));
    }

    #[test]
    fn a_bare_array_decodes_as_the_metrics_variant() {
        let raw = json!([]);
        let decoded: MetricsDiscoveryResponse = serde_json::from_value(raw).unwrap();
        assert!(matches!(decoded, MetricsDiscoveryResponse::Metrics(_)));
    }

    #[test]
    fn actions_carry_their_parameters() {
        let mut with_action = metric();
        with_action.actions = vec![ActionContract {
            name: "setTarget".to_owned(),
            label: "Set target temperature".to_owned(),
            parameters: vec![ActionParameterContract {
                name: "target".to_owned(),
                parameter_type: "Finite".to_owned(),
                required: true,
            }],
        }];
        let body = serde_json::to_value(&with_action).unwrap();
        assert_eq!(body["actions"][0]["name"], "setTarget");
        assert_eq!(body["actions"][0]["parameters"][0]["type"], "Finite");
    }
}
