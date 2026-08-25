use crate::kernel::ports::{ActionDispatch, DispatchError};
use crate::kernel::registry::PluginRegistry;
use crate::types::error::DomainError;
use crate::types::plugin::{ActionSpec, check_fields};
use crate::types::sensor::Command;
use serde_json::Value;
use std::sync::Arc;

pub struct Actions {
    pub registry: Arc<PluginRegistry>,
    pub dispatch: Arc<dyn ActionDispatch>,
}

impl Actions {
    pub fn catalog(&self, metric: &str) -> Result<&'static [ActionSpec], DomainError> {
        self.registry
            .get(metric)
            .map(|plugin| plugin.actions())
            .ok_or_else(|| DomainError::NotFound(format!("unknown sensor type: {metric}")))
    }

    pub async fn execute(&self, command: &Command) -> Result<(), DomainError> {
        let spec = self
            .catalog(&command.metric)?
            .iter()
            .find(|spec| spec.name == command.action)
            .ok_or_else(|| {
                DomainError::NotFound(format!(
                    "{} does not support the action {}.",
                    command.metric, command.action
                ))
            })?;

        let arguments = Value::Object(command.arguments.clone());
        let errors = check_fields(spec.parameters, &arguments);
        if !errors.is_empty() {
            return Err(DomainError::Validation(errors.join(" ")));
        }

        self.dispatch
            .dispatch(command)
            .await
            .map_err(|error| match error {
                DispatchError::Unconfigured(message) => DomainError::NotFound(message),
                DispatchError::Status(status) => {
                    DomainError::BadGateway(format!("downstream endpoint returned {status}."))
                }
                DispatchError::Unreachable(_) => {
                    DomainError::BadGateway("downstream endpoint is unreachable.".to_owned())
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kernel::fakes::{FakeDispatch, FakePlugin};
    use serde_json::json;

    struct Harness {
        dispatcher: Arc<FakeDispatch>,
        actions: Actions,
    }

    fn harness(dispatcher: FakeDispatch) -> Harness {
        let dispatcher = Arc::new(dispatcher);
        let registry =
            Arc::new(PluginRegistry::new(vec![Box::new(FakePlugin::default())]).unwrap());
        let actions = Actions {
            registry,
            dispatch: dispatcher.clone() as Arc<dyn ActionDispatch>,
        };
        Harness {
            dispatcher,
            actions,
        }
    }

    fn plain() -> Harness {
        harness(FakeDispatch::default())
    }

    fn command(action: &str, arguments: Value) -> Command {
        Command {
            metric: "fake".to_owned(),
            building_id: "b1".to_owned(),
            room_id: "r1".to_owned(),
            sensor_id: "s1".to_owned(),
            action: action.to_owned(),
            arguments: arguments.as_object().cloned().unwrap_or_default(),
        }
    }

    #[tokio::test]
    async fn a_declared_action_reaches_the_dispatcher_unchanged() {
        let h = plain();
        let command = command("setTarget", json!({ "target": 21 }));
        h.actions.execute(&command).await.unwrap();
        let sent = h.dispatcher.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0], command);
    }

    #[tokio::test]
    async fn an_action_without_parameters_needs_no_arguments() {
        let h = plain();
        h.actions
            .execute(&command("increase", json!({})))
            .await
            .unwrap();
        assert_eq!(h.dispatcher.sent.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn an_unknown_metric_is_not_found() {
        let h = plain();
        let mut command = command("setTarget", json!({ "target": 21 }));
        command.metric = "humidity".to_owned();
        let error = h.actions.execute(&command).await.unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_action_the_metric_does_not_declare_is_not_found() {
        let h = plain();
        let error = h
            .actions
            .execute(&command("selfDestruct", json!({})))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_missing_required_parameter_is_a_validation_error() {
        let h = plain();
        let error = h
            .actions
            .execute(&command("setTarget", json!({})))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_parameter_of_the_wrong_kind_is_a_validation_error() {
        let h = plain();
        let error = h
            .actions
            .execute(&command("setTarget", json!({ "target": "hot" })))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::Validation(_)));
        assert!(h.dispatcher.sent.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn an_optional_parameter_may_be_omitted() {
        let h = plain();
        h.actions
            .execute(&command("increase", json!({ "step": 2 })))
            .await
            .unwrap();
        h.actions
            .execute(&command("increase", json!({})))
            .await
            .unwrap();
        assert_eq!(h.dispatcher.sent.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn a_sensor_with_no_binding_is_not_found() {
        let h = harness(FakeDispatch {
            unconfigured: true,
            ..Default::default()
        });
        let error = h
            .actions
            .execute(&command("setTarget", json!({ "target": 21 })))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::NotFound(_)));
    }

    #[tokio::test]
    async fn a_downstream_error_status_is_a_bad_gateway() {
        let h = harness(FakeDispatch {
            status: Some(503),
            ..Default::default()
        });
        let error = h
            .actions
            .execute(&command("setTarget", json!({ "target": 21 })))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::BadGateway(_)));
    }

    #[tokio::test]
    async fn an_unreachable_downstream_is_a_bad_gateway() {
        let h = harness(FakeDispatch {
            unreachable: true,
            ..Default::default()
        });
        let error = h
            .actions
            .execute(&command("setTarget", json!({ "target": 21 })))
            .await
            .unwrap_err();
        assert!(matches!(error, DomainError::BadGateway(_)));
    }

    #[tokio::test]
    async fn the_catalog_lists_what_a_metric_can_do() {
        let h = plain();
        let names: Vec<&str> = h
            .actions
            .catalog("fake")
            .unwrap()
            .iter()
            .map(|spec| spec.name)
            .collect();
        assert_eq!(names, vec!["setTarget", "increase"]);
        assert!(h.actions.catalog("humidity").is_err());
    }
}
