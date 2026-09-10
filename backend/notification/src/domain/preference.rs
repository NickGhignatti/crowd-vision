use serde::{Deserialize, Serialize};

use crate::domain::error::DomainError;

pub const TEMPERATURE: &str = "temperature";
pub const NOTIFICATION_TYPES: &[&str] = &[TEMPERATURE];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Preference {
    #[serde(rename = "notificationType")]
    pub notification_type: String, // can become an enum if notification types are fixed
    #[serde(rename = "isSubscribed")]
    pub is_subscribed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccountPreferences {
    #[serde(rename = "accountName")]
    pub account_name: String,
    #[serde(rename = "domainName")]
    pub domain_name: String,
    #[serde(default)]
    pub preferences: Vec<Preference>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreferenceUpdate {
    pub account_name: String,
    pub domain_name: String,
    pub notification_type: String,
    pub enabled: bool,
}

impl PreferenceUpdate {
    pub fn new(
        account_name: &str,
        domain_name: &str,
        notification_type: Option<&str>,
        enabled: bool,
    ) -> Result<Self, DomainError> {
        if account_name.trim().is_empty() {
            return Err(DomainError::Validation(
                "Invalid authenticated account".to_string(),
            ));
        }
        if domain_name.is_empty() {
            return Err(DomainError::Validation(
                "domainName is required".to_string(),
            ));
        }
        let notification_type = notification_type
            .filter(|t| !t.is_empty())
            .unwrap_or(TEMPERATURE);
        if !NOTIFICATION_TYPES.contains(&notification_type) {
            return Err(DomainError::Validation(format!(
                "type must be one of: {}",
                NOTIFICATION_TYPES.join(", ")
            )));
        }
        Ok(PreferenceUpdate {
            account_name: account_name.to_string(),
            domain_name: domain_name.to_string(),
            notification_type: notification_type.to_string(),
            enabled,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct PreferenceEntry {
    #[serde(rename = "type", default)]
    pub notification_type: Option<String>,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PreferenceRequest {
    #[serde(default)]
    pub preferences: Option<Vec<PreferenceEntry>>,
    #[serde(default)]
    pub types: Option<Vec<String>>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(rename = "type", default)]
    pub notification_type: Option<String>,
}

impl PreferenceRequest {
    /// Returns the explicit preference entries, if any, for the given account and domain.
    fn explicit(
        &self,
        account_name: &str,
        domain_name: &str,
    ) -> Option<Result<Vec<PreferenceUpdate>, DomainError>> {
        let entries = self.preferences.as_ref().filter(|p| !p.is_empty())?;
        Some(
            entries
                .iter()
                .map(|entry| {
                    PreferenceUpdate::new(
                        account_name,
                        domain_name,
                        entry.notification_type.as_deref(),
                        entry.enabled,
                    )
                })
                .collect(),
        )
    }

    /// Returns the list of notification types, if any.
    fn listed(&self) -> Option<&Vec<String>> {
        self.types.as_ref().filter(|t| !t.is_empty())
    }

    /// Resolves a preference entry for the given account and domain, with lenient validation.
    pub fn resolve_lenient(
        &self,
        account_name: &str,
        domain_name: &str,
    ) -> Result<Vec<PreferenceUpdate>, DomainError> {
        if let Some(updates) = self.explicit(account_name, domain_name) {
            return updates;
        }
        let enabled = self.enabled != Some(false);
        match self.listed() {
            Some(types) => types
                .iter()
                .map(|t| PreferenceUpdate::new(account_name, domain_name, Some(t), enabled))
                .collect(),
            None => Ok(vec![PreferenceUpdate::new(
                account_name,
                domain_name,
                Some(TEMPERATURE),
                enabled,
            )?]),
        }
    }

    /// Resolves a preference entry for the given account and domain, with strict validation.
    pub fn resolve_strict(
        &self,
        account_name: &str,
        domain_name: &str,
    ) -> Result<Vec<PreferenceUpdate>, DomainError> {
        let unnamed =
            |entry: &PreferenceEntry| entry.notification_type.as_deref().is_none_or(str::is_empty);
        if self.preferences.iter().flatten().any(unnamed) {
            return Err(parameter_is_required("type"));
        }
        if let Some(updates) = self.explicit(account_name, domain_name) {
            return updates;
        }
        match self.listed() {
            Some(types) => {
                let enabled = self
                    .enabled
                    .ok_or_else(|| parameter_is_required("enabled"))?;
                types
                    .iter()
                    .map(|t| PreferenceUpdate::new(account_name, domain_name, Some(t), enabled))
                    .collect()
            }
            None => {
                let enabled = self
                    .enabled
                    .ok_or_else(|| parameter_is_required("enabled"))?;
                let notification_type = self
                    .notification_type
                    .as_deref()
                    .filter(|t| !t.is_empty())
                    .ok_or_else(|| parameter_is_required("type"))?;
                Ok(vec![PreferenceUpdate::new(
                    account_name,
                    domain_name,
                    Some(notification_type),
                    enabled,
                )?])
            }
        }
    }
}

fn parameter_is_required(name: &str) -> DomainError {
    DomainError::validation(format!("{} is required", name).as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(json: serde_json::Value) -> PreferenceRequest {
        serde_json::from_value(json).unwrap()
    }

    fn pairs(updates: Vec<PreferenceUpdate>) -> Vec<(String, bool)> {
        updates
            .into_iter()
            .map(|u| (u.notification_type, u.enabled))
            .collect()
    }

    fn update(
        account: &str,
        domain: &str,
        kind: Option<&str>,
    ) -> Result<PreferenceUpdate, DomainError> {
        PreferenceUpdate::new(account, domain, kind, true)
    }

    #[test]
    fn an_absent_notification_type_defaults_to_temperature() {
        assert_eq!(
            update("ada", "d1", None).unwrap().notification_type,
            TEMPERATURE
        );
    }

    #[test]
    fn an_empty_notification_type_defaults_to_temperature() {
        assert_eq!(
            update("ada", "d1", Some("")).unwrap().notification_type,
            TEMPERATURE
        );
    }

    #[test]
    fn a_known_notification_type_is_kept() {
        assert_eq!(
            update("ada", "d1", Some(TEMPERATURE))
                .unwrap()
                .notification_type,
            TEMPERATURE
        );
    }

    #[test]
    fn a_type_without_a_delivery_path_is_rejected() {
        assert!(matches!(
            update("ada", "d1", Some("humidity")),
            Err(DomainError::Validation(m)) if m == "type must be one of: temperature"
        ));
    }

    #[test]
    fn a_blank_account_is_rejected() {
        assert!(matches!(
            update("   ", "d1", None),
            Err(DomainError::Validation(_))
        ));
    }

    #[test]
    fn a_missing_domain_is_rejected() {
        assert!(matches!(
            update("ada", "", None),
            Err(DomainError::Validation(_))
        ));
    }

    #[test]
    fn an_explicit_preferences_array_wins_over_types_and_enabled() {
        let request = request(serde_json::json!({
            "preferences": [{ "type": "temperature", "enabled": false }],
            "types": ["temperature"],
            "enabled": true,
        }));

        let expected = vec![("temperature".to_string(), false)];
        assert_eq!(
            pairs(request.resolve_lenient("ada", "d1").unwrap()),
            expected
        );
        assert_eq!(
            pairs(request.resolve_strict("ada", "d1").unwrap()),
            expected
        );
    }

    #[test]
    fn a_types_array_applies_the_shared_enabled_flag() {
        let request = request(serde_json::json!({ "types": [TEMPERATURE], "enabled": false }));
        assert_eq!(
            pairs(request.resolve_strict("ada", "d1").unwrap()),
            vec![(TEMPERATURE.to_string(), false)]
        );
    }

    #[test]
    fn subscribe_treats_an_absent_enabled_as_on() {
        let request = request(serde_json::json!({ "types": [TEMPERATURE] }));
        assert_eq!(
            pairs(request.resolve_lenient("ada", "d1").unwrap()),
            vec![(TEMPERATURE.to_string(), true)]
        );
    }

    #[test]
    fn subscribe_honours_an_explicit_enabled_false() {
        let request = request(serde_json::json!({ "enabled": false }));
        assert_eq!(
            pairs(request.resolve_lenient("ada", "d1").unwrap()),
            vec![(TEMPERATURE.to_string(), false)]
        );
    }

    #[test]
    fn subscribe_falls_back_to_a_single_temperature_preference() {
        let request = request(serde_json::json!({}));
        assert_eq!(
            pairs(request.resolve_lenient("ada", "d1").unwrap()),
            vec![(TEMPERATURE.to_string(), true)]
        );
    }

    #[test]
    fn updating_preferences_requires_an_explicit_enabled_alongside_types() {
        let request = request(serde_json::json!({ "types": [TEMPERATURE] }));
        assert!(matches!(
            request.resolve_strict("ada", "d1"),
            Err(DomainError::Validation(m)) if m == "enabled is required"
        ));
    }

    #[test]
    fn updating_a_single_preference_requires_an_explicit_enabled() {
        let request = request(serde_json::json!({ "type": "a" }));
        assert!(matches!(
            request.resolve_strict("ada", "d1"),
            Err(DomainError::Validation(m)) if m == "enabled is required"
        ));
    }

    #[test]
    fn updating_a_single_preference_requires_a_type() {
        let request = request(serde_json::json!({ "enabled": true }));
        assert!(matches!(
            request.resolve_strict("ada", "d1"),
            Err(DomainError::Validation(m)) if m == "type is required"
        ));
    }

    #[test]
    fn an_empty_preferences_array_falls_through_to_the_other_forms() {
        let request = request(
            serde_json::json!({ "preferences": [], "type": "temperature", "enabled": true }),
        );
        assert_eq!(
            pairs(request.resolve_strict("ada", "d1").unwrap()),
            vec![(TEMPERATURE.to_string(), true)]
        );
    }

    #[test]
    fn preferences_serialise_with_the_field_names_the_frontend_reads() {
        let payload = serde_json::to_value(AccountPreferences {
            account_name: "ada".into(),
            domain_name: "d1".into(),
            preferences: vec![Preference {
                notification_type: TEMPERATURE.into(),
                is_subscribed: true,
            }],
            created_at: "2023-11-14T22:13:20.000Z".into(),
        })
        .unwrap();

        assert_eq!(payload["domainName"], "d1");
        assert_eq!(payload["preferences"][0]["notificationType"], "temperature");
        assert_eq!(payload["preferences"][0]["isSubscribed"], true);
    }

    #[test]
    fn an_update_entry_must_name_its_type_but_subscribe_defaults_it() {
        let request = request(serde_json::json!({ "preferences": [{ "enabled": true }] }));
        assert!(matches!(
            request.resolve_strict("ada", "d1"),
            Err(DomainError::Validation(m)) if m == "type is required"
        ));
        assert_eq!(
            pairs(request.resolve_lenient("ada", "d1").unwrap()),
            vec![(TEMPERATURE.to_string(), true)]
        );
    }

    #[test]
    fn subscribe_also_refuses_a_type_without_a_delivery_path() {
        let request = request(serde_json::json!({ "types": ["humidity"] }));
        assert!(matches!(
            request.resolve_lenient("ada", "d1"),
            Err(DomainError::Validation(m)) if m == "type must be one of: temperature"
        ));
    }

    const WIRE: &str = include_str!("../../../../schemas/fixtures/notification-preferences.json");

    #[test]
    fn the_fixture_reply_round_trips_byte_for_byte() {
        let wire: serde_json::Value = serde_json::from_str(WIRE).unwrap();
        let record = wire["response"]["accountPreferences"][0].clone();
        let parsed: AccountPreferences = serde_json::from_value(record.clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed).unwrap(), record);
    }
}
