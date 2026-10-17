use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, de::Error};

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
    /// The only room that receives it; there is no broadcast, so an empty name is refused.
    #[serde(deserialize_with = "non_empty")]
    pub domain_name: String,
    /// The alertable metric of a breach; the bell hides it when the account switched it off.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metric: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

fn non_empty<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    if value.is_empty() {
        return Err(D::Error::custom("must not be empty"));
    }
    Ok(value)
}
