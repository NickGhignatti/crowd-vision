use crate::kernel::ports::{ActionDispatch, DispatchError};
use crate::types::sensor::Command;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{Map, Value};
use sqlx::PgPool;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct Binding {
    pub path: String,
    #[serde(default = "post")]
    pub method: String,
    #[serde(default)]
    pub fields: HashMap<String, String>,
}

fn post() -> String {
    "POST".to_owned()
}

pub type Bindings = HashMap<String, HashMap<String, Binding>>;

pub struct HttpDispatch {
    sensors_pool: PgPool,
    bindings: Bindings,
    client: reqwest::Client,
}

impl HttpDispatch {
    pub fn new(sensors_pool: PgPool, bindings: Bindings) -> Self {
        Self {
            sensors_pool,
            bindings,
            client: reqwest::Client::new(),
        }
    }

    pub fn from_json(pool: PgPool, raw: &str) -> anyhow::Result<Self> {
        Ok(Self::new(pool, serde_json::from_str(raw)?))
    }

    pub fn actions_for_sensor(&self, driver: Option<&str>) -> Vec<String> {
        let Some(driver) = driver else {
            return Vec::new();
        };
        let mut names: Vec<String> = self
            .bindings
            .get(driver)
            .map(|actions| actions.keys().cloned().collect())
            .unwrap_or_default();
        names.sort();
        names
    }

    async fn resolve_target(&self, command: &Command) -> Result<(String, Binding), DispatchError> {
        let row: Option<(Option<String>, Option<String>)> = sqlx::query_as(
            "select driver, endpoint from sensors
             where building_id = $1 and room_id = $2 and sensor_id = $3",
        )
        .bind(&command.building_id)
        .bind(&command.room_id)
        .bind(&command.sensor_id)
        .fetch_optional(&self.sensors_pool)
        .await
        .map_err(|error| DispatchError::Unreachable(error.to_string()))?;

        let unconfigured = || {
            DispatchError::Unconfigured(format!(
                "no binding for sensor {} on action {}.",
                command.sensor_id, command.action
            ))
        };

        let (Some(driver), Some(endpoint)) = row.ok_or_else(unconfigured)? else {
            return Err(unconfigured());
        };
        let binding = self
            .bindings
            .get(&driver)
            .and_then(|actions| actions.get(&command.action))
            .ok_or_else(unconfigured)?;

        Ok((endpoint, binding.clone()))
    }
}

fn rename(binding: &Binding, arguments: &Map<String, Value>) -> Map<String, Value> {
    binding
        .fields
        .iter()
        .filter_map(|(ours, theirs)| Some((theirs.clone(), arguments.get(ours).cloned()?)))
        .collect()
}

fn is_http(url: &str) -> bool {
    let url = url.to_ascii_lowercase();
    url.starts_with("http://") || url.starts_with("https://")
}

#[async_trait]
impl ActionDispatch for HttpDispatch {
    async fn dispatch(&self, command: &Command) -> Result<(), DispatchError> {
        let (endpoint, binding) = self.resolve_target(command).await?;
        let url = format!("{}{}", endpoint.trim_end_matches('/'), binding.path);

        if !is_http(&url) {
            log::error!(
                "refusing non-http endpoint for sensor {}",
                command.sensor_id
            );
            return Err(DispatchError::Unconfigured(
                "action configuration is unavailable.".to_owned(),
            ));
        }

        let method = reqwest::Method::from_bytes(binding.method.as_bytes())
            .map_err(|_| DispatchError::Unconfigured("unsupported method.".to_owned()))?;

        let response = self
            .client
            .request(method, &url)
            .json(&Value::Object(rename(&binding, &command.arguments)))
            .send()
            .await
            .map_err(|error| DispatchError::Unreachable(error.to_string()))?;

        match response.status().is_success() {
            true => Ok(()),
            false => Err(DispatchError::Status(response.status().as_u16())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bindings() -> Bindings {
        serde_json::from_str(
            r#"{ "tp-simulator": {
                   "setTarget": { "path": "/control/receive", "fields": { "target": "value" } },
                   "increase":  { "path": "/control/step", "method": "PUT", "fields": {} } } }"#,
        )
        .unwrap()
    }

    fn arguments(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    #[test]
    fn our_parameter_names_are_renamed_to_the_devices() {
        let binding = bindings()["tp-simulator"]["setTarget"].clone();
        let body = rename(&binding, &arguments(serde_json::json!({ "target": 21 })));
        assert_eq!(body["value"], 21);
        assert!(!body.contains_key("target"));
    }

    #[test]
    fn an_argument_the_binding_does_not_map_is_dropped() {
        let binding = bindings()["tp-simulator"]["setTarget"].clone();
        let body = rename(
            &binding,
            &arguments(serde_json::json!({ "target": 21, "unit": "C" })),
        );
        assert_eq!(body.len(), 1);
    }

    #[test]
    fn an_action_without_fields_sends_an_empty_body() {
        let binding = bindings()["tp-simulator"]["increase"].clone();
        assert!(rename(&binding, &arguments(serde_json::json!({ "step": 2 }))).is_empty());
    }

    #[test]
    fn method_defaults_to_post() {
        assert_eq!(bindings()["tp-simulator"]["setTarget"].method, "POST");
        assert_eq!(bindings()["tp-simulator"]["increase"].method, "PUT");
    }

    #[test]
    fn only_http_urls_are_accepted() {
        assert!(is_http("http://a/b"));
        assert!(is_http("HTTPS://a/b"));
        assert!(!is_http("file:///etc/passwd"));
        assert!(!is_http("unix:///var/run/docker.sock"));
    }
}
