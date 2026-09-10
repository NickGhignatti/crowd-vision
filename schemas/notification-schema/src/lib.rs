use std::str::FromStr;

use serde::{Deserialize, Serialize};

/// Redis channel notification publishes on and socket relays from.
pub const NOTIFICATIONS_CHANNEL: &str = "notifications";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Info,
    Warning,
    Danger,
}

impl FromStr for Severity {
    type Err = serde_json::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        serde_json::from_value(serde_json::Value::from(s))
    }
}

/// One message for both deliveries: the in-app bell and the Web Push pop-up.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    pub id: String,
    pub r#type: Severity,
    pub title: String,
    pub message: String,
    pub timestamp: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub domain_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}
