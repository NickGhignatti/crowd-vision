use serde::{Deserialize, Serialize};

use crate::domain::error::DomainError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WebPushSubscription {
    #[serde(rename = "accountName")]
    pub account_name: String,
    pub endpoint: String,
    pub keys: SubscriptionKeys,
}

impl WebPushSubscription {
    pub fn new(
        account_name: &str,
        endpoint: Option<&str>,
        p256dh: Option<&str>,
        auth: Option<&str>,
    ) -> Result<Self, DomainError> {
        if account_name.trim().is_empty() {
            return Err(DomainError::Validation(
                "Invalid authenticated account".to_string(),
            ));
        }
        fn present(value: Option<&str>) -> Result<&str, DomainError> {
            value.filter(|v| !v.is_empty()).ok_or_else(|| {
                DomainError::Validation("Invalid push subscription payload".to_string())
            })
        }

        Ok(WebPushSubscription {
            account_name: account_name.to_string(),
            endpoint: present(endpoint)?.to_string(),
            keys: SubscriptionKeys {
                p256dh: present(p256dh)?.to_string(),
                auth: present(auth)?.to_string(),
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(
        endpoint: Option<&str>,
        p256dh: Option<&str>,
        auth: Option<&str>,
    ) -> Result<WebPushSubscription, DomainError> {
        WebPushSubscription::new("ada", endpoint, p256dh, auth)
    }

    #[test]
    fn a_complete_payload_is_accepted() {
        let subscription = build(Some("https://push/1"), Some("p"), Some("a")).unwrap();
        assert_eq!(subscription.account_name, "ada");
        assert_eq!(subscription.endpoint, "https://push/1");
        assert_eq!(subscription.keys.p256dh, "p");
        assert_eq!(subscription.keys.auth, "a");
    }

    #[test]
    fn a_missing_endpoint_is_rejected() {
        assert!(build(None, Some("p"), Some("a")).is_err());
    }

    #[test]
    fn a_missing_p256dh_is_rejected() {
        assert!(build(Some("https://push/1"), None, Some("a")).is_err());
    }

    #[test]
    fn a_missing_auth_is_rejected() {
        assert!(build(Some("https://push/1"), Some("p"), None).is_err());
    }

    #[test]
    fn empty_strings_are_rejected_the_same_as_absent_fields() {
        assert!(build(Some(""), Some("p"), Some("a")).is_err());
        assert!(build(Some("https://push/1"), Some(""), Some("a")).is_err());
        assert!(build(Some("https://push/1"), Some("p"), Some("")).is_err());
    }

    #[test]
    fn a_blank_account_is_rejected() {
        assert!(
            WebPushSubscription::new("  ", Some("https://push/1"), Some("p"), Some("a")).is_err()
        );
    }
}
