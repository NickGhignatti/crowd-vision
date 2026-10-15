use serde::{Deserialize, Serialize};
use url::Url;

use crate::domain::error::DomainError;

/// Hosts of the browser push services (Chrome, Firefox, Safari, Edge); the server POSTs to the endpoint.
const PUSH_SERVICE_HOSTS: [&str; 4] = [
    "fcm.googleapis.com",
    "push.services.mozilla.com",
    "push.apple.com",
    "notify.windows.com",
];

/// True for an `https` URL on the default port whose host is, or is under, a known push service.
fn is_push_service_endpoint(endpoint: &str) -> bool {
    let Ok(url) = Url::parse(endpoint) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };
    url.scheme() == "https"
        && url.port().is_none()
        && PUSH_SERVICE_HOSTS
            .iter()
            .any(|known| host == *known || host.ends_with(&format!(".{known}")))
}

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

        let endpoint = present(endpoint)?;
        if !is_push_service_endpoint(endpoint) {
            return Err(DomainError::Validation(
                "Push endpoint must be an https URL on a known push service".to_string(),
            ));
        }

        Ok(WebPushSubscription {
            account_name: account_name.to_string(),
            endpoint: endpoint.to_string(),
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
        let subscription = build(
            Some("https://fcm.googleapis.com/fcm/send/1"),
            Some("p"),
            Some("a"),
        )
        .unwrap();
        assert_eq!(subscription.account_name, "ada");
        assert_eq!(
            subscription.endpoint,
            "https://fcm.googleapis.com/fcm/send/1"
        );
        assert_eq!(subscription.keys.p256dh, "p");
        assert_eq!(subscription.keys.auth, "a");
    }

    #[test]
    fn a_missing_endpoint_is_rejected() {
        assert!(build(None, Some("p"), Some("a")).is_err());
    }

    #[test]
    fn a_missing_p256dh_is_rejected() {
        assert!(
            build(
                Some("https://fcm.googleapis.com/fcm/send/1"),
                None,
                Some("a")
            )
            .is_err()
        );
    }

    #[test]
    fn a_missing_auth_is_rejected() {
        assert!(
            build(
                Some("https://fcm.googleapis.com/fcm/send/1"),
                Some("p"),
                None
            )
            .is_err()
        );
    }

    #[test]
    fn empty_strings_are_rejected_the_same_as_absent_fields() {
        assert!(build(Some(""), Some("p"), Some("a")).is_err());
        assert!(
            build(
                Some("https://fcm.googleapis.com/fcm/send/1"),
                Some(""),
                Some("a")
            )
            .is_err()
        );
        assert!(
            build(
                Some("https://fcm.googleapis.com/fcm/send/1"),
                Some("p"),
                Some("")
            )
            .is_err()
        );
    }

    #[test]
    fn endpoints_on_the_known_push_services_are_accepted() {
        for endpoint in [
            "https://fcm.googleapis.com/fcm/send/abc",
            "https://updates.push.services.mozilla.com/wpush/v2/abc",
            "https://web.push.apple.com/abc",
            "https://wns2-par02p.notify.windows.com/w/?token=abc",
        ] {
            assert!(
                build(Some(endpoint), Some("p"), Some("a")).is_ok(),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn endpoints_the_server_must_not_post_to_are_rejected() {
        for endpoint in [
            "http://fcm.googleapis.com/fcm/send/abc",
            "https://169.254.169.254/latest/meta-data",
            "https://notification:3000/trigger",
            "https://localhost/x",
            "https://fcm.googleapis.com.evil.example/x",
            "https://evilfcm.googleapis.com.example/x",
            "https://fcm.googleapis.com@evil.example/x",
            "https://fcm.googleapis.com:8443/x",
            "not a url",
        ] {
            assert!(
                build(Some(endpoint), Some("p"), Some("a")).is_err(),
                "{endpoint}"
            );
        }
    }

    #[test]
    fn a_blank_account_is_rejected() {
        assert!(
            WebPushSubscription::new(
                "  ",
                Some("https://fcm.googleapis.com/fcm/send/1"),
                Some("p"),
                Some("a")
            )
            .is_err()
        );
    }
}
