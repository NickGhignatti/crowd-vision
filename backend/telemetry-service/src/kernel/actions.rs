use crate::contracts::error::DomainError;
use crate::contracts::sensor::ActionEndpoint;
use crate::kernel::ports::{ActionDispatch, DispatchError};
use serde_json::{Map, Value};
use std::sync::Arc;

pub struct Actions {
    pub dispatch: Arc<dyn ActionDispatch>,
}

impl Actions {
    pub async fn execute(&self, payload: &Value) -> Result<(), DomainError> {
        let data = payload
            .get("actionData")
            .filter(|data| data.is_object())
            .ok_or_else(|| DomainError::Validation("actionData: must be an object.".to_owned()))?;

        let action_name = field(data, "actionName")?;
        let sensor_id = field(data, "sensorId")?;

        let endpoint = self
            .dispatch
            .endpoint(&action_name, &sensor_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound(format!(
                    "no endpoint configured for sensor {sensor_id} on action {action_name}."
                ))
            })?;

        if !is_http(&endpoint.url) {
            return Err(DomainError::Internal(anyhow::anyhow!(
                "action configuration is unavailable."
            )));
        }

        let body = map_arguments(&endpoint, data["actionArguments"].as_array());

        self.dispatch
            .dispatch(&endpoint, &body)
            .await
            .map_err(|error| match error {
                DispatchError::Status(status) => {
                    DomainError::BadGateway(format!("downstream endpoint returned {status}."))
                }
                DispatchError::Unreachable(_) => {
                    DomainError::BadGateway("downstream endpoint is unreachable.".to_owned())
                }
            })
    }
}

fn field(data: &Value, name: &str) -> Result<String, DomainError> {
    data[name]
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| DomainError::Validation(format!("{name}: must be a non-empty string.")))
}

fn is_http(url: &str) -> bool {
    let url = url.to_ascii_lowercase();
    url.starts_with("http://") || url.starts_with("https://")
}

fn map_arguments(endpoint: &ActionEndpoint, args: Option<&Vec<Value>>) -> Map<String, Value> {
    let empty = Vec::new();
    let args = args.unwrap_or(&empty);
    endpoint
        .arguments
        .iter()
        .filter_map(|(index, name)| {
            let index: usize = index.parse().ok()?;
            let name = name.as_str()?;
            Some((
                name.to_owned(),
                args.get(index).cloned().unwrap_or(Value::Null),
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakeDispatch, endpoint};
    use serde_json::json;

    struct Harness {
        dispatcher: Arc<FakeDispatch>,
        actions: Actions,
    }

    fn harness(dispatcher: FakeDispatch) -> Harness {
        let dispatcher = Arc::new(dispatcher);
        let actions = Actions {
            dispatch: dispatcher.clone() as Arc<dyn ActionDispatch>,
        };
        Harness {
            dispatcher,
            actions,
        }
    }

    fn configured(url: &str) -> FakeDispatch {
        FakeDispatch {
            endpoints: vec![(
                "setTemp".to_owned(),
                "s1".to_owned(),
                endpoint(url, "POST", json!({ "0": "value" })),
            )],
            ..Default::default()
        }
    }

    fn payload(args: Value) -> Value {
        json!({ "actionData": {
            "actionName": "setTemp", "sensorId": "s1", "actionArguments": args
        }})
    }

    #[tokio::test]
    async fn a_configured_action_is_dispatched_with_named_arguments() {
        let h = harness(configured("http://boiler.local/set"));
        h.actions.execute(&payload(json!(["21"]))).await.unwrap();
        let sent = h.dispatcher.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].0.url, "http://boiler.local/set");
        assert_eq!(sent[0].1["value"], "21");
    }

    #[tokio::test]
    async fn a_missing_argument_maps_to_null() {
        let h = harness(configured("http://boiler.local/set"));
        h.actions.execute(&payload(json!([]))).await.unwrap();
        let sent = h.dispatcher.sent.lock().unwrap();
        assert_eq!(sent[0].1["value"], Value::Null);
    }

    #[tokio::test]
    async fn a_missing_action_data_is_a_validation_error() {
        let h = harness(configured("http://boiler.local/set"));
        let error = h.actions.execute(&json!({})).await.unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_blank_action_name_is_a_validation_error() {
        let h = harness(configured("http://boiler.local/set"));
        let error = h
            .actions
            .execute(&json!({ "actionData": { "actionName": " ", "sensorId": "s1" } }))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
    }

    #[tokio::test]
    async fn an_unconfigured_action_is_not_found() {
        let h = harness(FakeDispatch::default());
        let error = h
            .actions
            .execute(&payload(json!(["21"])))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_non_http_endpoint_url_is_refused_before_dispatch() {
        let h = harness(configured("file:///etc/passwd"));
        let error = h
            .actions
            .execute(&payload(json!(["21"])))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Internal(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_https_endpoint_url_is_accepted() {
        let h = harness(configured("HTTPS://boiler.local/set"));
        h.actions.execute(&payload(json!(["21"]))).await.unwrap();
        assert_eq!(h.dispatcher.sent.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_downstream_error_status_is_a_bad_gateway() {
        let mut dispatcher = configured("http://boiler.local/set");
        dispatcher.status = Some(503);
        let h = harness(dispatcher);
        let error = h
            .actions
            .execute(&payload(json!(["21"])))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::BadGateway(_)));
    }

    #[tokio::test]
    async fn an_unreachable_downstream_is_a_bad_gateway() {
        let mut dispatcher = configured("http://boiler.local/set");
        dispatcher.unreachable = true;
        let h = harness(dispatcher);
        let error = h
            .actions
            .execute(&payload(json!(["21"])))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::BadGateway(_)));
    }
}
