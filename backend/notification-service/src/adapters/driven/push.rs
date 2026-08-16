use async_trait::async_trait;
use web_push::{
    ContentEncoding, PartialVapidSignatureBuilder, SubscriptionInfo, VapidSignatureBuilder,
    WebPushMessage, WebPushMessageBuilder,
};

use crate::domain::{PushPayload, WebPushSubscription};
use crate::service::ports::{PushOutcome, PushSender};

const SUBJECT: &str = "mailto:admin@crowdvision.com";

pub struct WebPushSender {
    signer: Option<PartialVapidSignatureBuilder>,
    client: reqwest::Client,
}

impl WebPushSender {
    /// Mirrors the Node service's guard: without both keys the service still starts,
    /// and every send fails loudly instead of the process refusing to boot.
    pub fn new(public_key: &str, private_key: &str) -> Self {
        let signer = (!public_key.is_empty() && !private_key.is_empty())
            .then(|| VapidSignatureBuilder::from_base64_no_sub(private_key))
            .transpose()
            .unwrap_or_else(|e| {
                log::error!("VAPID private key is not a valid base64url EC key: {e}");
                None
            });
        if signer.is_none() {
            log::error!("VAPID keys are not configured; push notifications are disabled");
        }
        WebPushSender {
            signer,
            client: reqwest::Client::new(),
        }
    }

    fn encrypt(
        &self,
        subscription: &WebPushSubscription,
        body: &[u8],
    ) -> anyhow::Result<WebPushMessage> {
        let signer = self
            .signer
            .clone()
            .ok_or_else(|| anyhow::anyhow!("VAPID keys are not configured"))?;
        let info = SubscriptionInfo::new(
            subscription.endpoint.clone(),
            subscription.keys.p256dh.clone(),
            subscription.keys.auth.clone(),
        );

        let mut signature = signer.add_sub_info(&info);
        signature.add_claim("sub", SUBJECT);

        let mut message = WebPushMessageBuilder::new(&info);
        message.set_payload(ContentEncoding::Aes128Gcm, body);
        message.set_vapid_signature(signature.build()?);
        Ok(message.build()?)
    }

    async fn post(&self, message: WebPushMessage) -> anyhow::Result<u16> {
        let mut request = self
            .client
            .post(message.endpoint.to_string())
            .header("TTL", message.ttl.to_string());

        if let Some(payload) = message.payload {
            request = request
                .header("content-encoding", payload.content_encoding.to_str())
                .header("content-type", "application/octet-stream");
            for (name, value) in payload.crypto_headers {
                request = request.header(name, value);
            }
            request = request.body(payload.content);
        }

        Ok(request.send().await?.status().as_u16())
    }
}

#[async_trait]
impl PushSender for WebPushSender {
    async fn send(&self, subscription: &WebPushSubscription, payload: &PushPayload) -> PushOutcome {
        let body = match serde_json::to_vec(payload) {
            Ok(body) => body,
            Err(e) => {
                log::error!("Push failed: {e}");
                return PushOutcome::Failed;
            }
        };

        let message = match self.encrypt(subscription, &body) {
            Ok(message) => message,
            Err(e) => {
                log::error!("Push failed: {e}");
                return PushOutcome::Failed;
            }
        };

        match self.post(message).await {
            Ok(410) | Ok(403) => PushOutcome::SubscriptionGone,
            Ok(status) if (200..300).contains(&status) => PushOutcome::Delivered,
            Ok(status) => {
                log::error!("Push failed: {status}");
                PushOutcome::Failed
            }
            Err(e) => {
                log::error!("Push failed: {e}");
                PushOutcome::Failed
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::SubscriptionKeys;
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use wiremock::matchers::{header, method};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const PRIVATE_KEY: &str = "IQ9Ur0ykXoHS9gzfYX0aBjy9lvdrjx_PFUXmie9YRcY";
    const PUBLIC_KEY: &str =
        "BMo1HqKF6skMZYykrte9duqYwBD08mDQKTunRkJdD3sTJ9E-yyN6sJlPWTpKNhp-y2KeS6oANHF-q3w37bClb7U";

    fn subscription(endpoint: String) -> WebPushSubscription {
        WebPushSubscription {
            account_name: "ada".to_string(),
            endpoint,
            keys: SubscriptionKeys {
                p256dh: "BH1HTeKM7-NwaLGHEqxeu2IamQaVVLkcsFHPIHmsCnqxcBHPQBprF41bEMOr3O1hUQ2jU1opNEm1F_lZV_sxMP8".to_string(),
                auth: "sBXU5_tIYz-5w7G2B25BEw".to_string(),
            },
        }
    }

    async fn outcome_for(status: u16) -> PushOutcome {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(header("content-encoding", "aes128gcm"))
            .respond_with(ResponseTemplate::new(status))
            .mount(&server)
            .await;

        WebPushSender::new(PUBLIC_KEY, PRIVATE_KEY)
            .send(
                &subscription(format!("{}/push/1", server.uri())),
                &PushPayload::new(None, None, None),
            )
            .await
    }

    #[tokio::test]
    async fn a_201_is_a_delivery() {
        assert_eq!(outcome_for(201).await, PushOutcome::Delivered);
    }

    #[tokio::test]
    async fn a_410_means_the_subscription_is_gone() {
        assert_eq!(outcome_for(410).await, PushOutcome::SubscriptionGone);
    }

    #[tokio::test]
    async fn a_403_means_the_subscription_is_gone() {
        assert_eq!(outcome_for(403).await, PushOutcome::SubscriptionGone);
    }

    #[tokio::test]
    async fn any_other_error_status_is_a_plain_failure() {
        assert_eq!(outcome_for(500).await, PushOutcome::Failed);
        assert_eq!(outcome_for(401).await, PushOutcome::Failed);
        assert_eq!(outcome_for(429).await, PushOutcome::Failed);
    }

    #[tokio::test]
    async fn the_request_carries_a_vapid_authorization_header_for_the_configured_key() {
        let sender = WebPushSender::new(PUBLIC_KEY, PRIVATE_KEY);
        let advertised = URL_SAFE_NO_PAD.encode(sender.signer.clone().unwrap().get_public_key());

        let message = sender
            .encrypt(
                &subscription("https://push.example/1".to_string()),
                br#"{"title":"t"}"#,
            )
            .unwrap();

        let payload = message.payload.unwrap();
        let authorization = payload
            .crypto_headers
            .iter()
            .find(|(name, _)| *name == "Authorization")
            .map(|(_, value)| value.clone())
            .unwrap();

        assert!(authorization.starts_with("vapid t="));
        assert!(authorization.contains(&format!("k={advertised}")));
        assert!(!payload.content.is_empty());
    }

    #[tokio::test]
    async fn missing_vapid_keys_fail_every_send_instead_of_panicking() {
        let outcome = WebPushSender::new("", "")
            .send(
                &subscription("https://push.example/1".to_string()),
                &PushPayload::new(None, None, None),
            )
            .await;
        assert_eq!(outcome, PushOutcome::Failed);
    }
}
