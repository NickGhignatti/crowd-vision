use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::Deserialize;
use serde_json::json;

use crate::domain::{
    Audience, DomainError, GatewayClaims, ManualTemperatureAlert, PreferenceRequest,
    WebPushSubscription,
};
use crate::state::AppState;

#[derive(Debug, Clone, Default, Deserialize)]
pub struct IncomingKeys {
    #[serde(default)]
    pub p256dh: Option<String>,
    #[serde(default)]
    pub auth: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct IncomingSubscription {
    #[serde(default)]
    pub endpoint: Option<String>,
    #[serde(default)]
    pub keys: Option<IncomingKeys>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct SubscribeRequest {
    #[serde(rename = "domainName")]
    pub domain_name: Option<String>,
    #[serde(rename = "domainId")]
    pub domain_id: Option<String>,
    pub subscription: Option<IncomingSubscription>,
    pub endpoint: Option<String>,
    pub keys: Option<IncomingKeys>,
    #[serde(flatten)]
    pub preferences: PreferenceRequest,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct UpdatePreferenceRequest {
    #[serde(rename = "domainName")]
    pub domain_name: Option<String>,
    #[serde(rename = "domainId")]
    pub domain_id: Option<String>,
    #[serde(flatten)]
    pub preferences: PreferenceRequest,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TriggerRequest {
    pub message: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    #[serde(rename = "buildingName")]
    pub building_name: Option<String>,
    #[serde(rename = "notificationType")]
    pub notification_type: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TemperatureRequest {
    #[serde(rename = "roomId")]
    pub room_id: Option<String>,
    #[serde(rename = "buildingId")]
    pub building_id: Option<String>,
    pub temperature: Option<f64>,
    #[serde(rename = "domainName")]
    pub domain_name: Option<String>,
    #[serde(rename = "domainId")]
    pub domain_id: Option<String>,
    #[serde(rename = "type")]
    pub notification_type: Option<String>,
}

fn domain_of(domain_name: Option<String>, domain_id: Option<String>) -> Option<String> {
    domain_name.or(domain_id).filter(|d| !d.is_empty())
}

fn require_membership(claims: &GatewayClaims, domain_name: &str) -> Result<(), DomainError> {
    if Audience::of(claims).permits(domain_name) {
        return Ok(());
    }
    Err(DomainError::Forbidden(format!(
        "Not a member of domain {domain_name}"
    )))
}

pub async fn public_key(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({ "publicVapidKey": state.vapid_public_key }))
}

pub async fn subscribe(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<SubscribeRequest>,
) -> Result<impl IntoResponse, DomainError> {
    let account_name = claims.account_name();
    let supplied = match body.subscription {
        Some(subscription) if subscription.endpoint.is_some() => subscription,
        _ => IncomingSubscription {
            endpoint: body.endpoint,
            keys: body.keys,
        },
    };
    let keys = supplied.keys.unwrap_or_default();

    let subscription = WebPushSubscription::new(
        account_name,
        supplied.endpoint.as_deref(),
        keys.p256dh.as_deref(),
        keys.auth.as_deref(),
    )?;
    state.preferences.register_device(&subscription).await?;

    if let Some(domain_name) = domain_of(body.domain_name, body.domain_id) {
        require_membership(&claims, &domain_name)?;
        let updates = body
            .preferences
            .resolve_lenient(account_name, &domain_name)?;
        state.preferences.apply(&updates).await?;
    }

    Ok((StatusCode::CREATED, Json(json!({ "success": true }))))
}

pub async fn get_preferences(
    State(state): State<AppState>,
    claims: GatewayClaims,
) -> Result<impl IntoResponse, DomainError> {
    let account_preferences = state.preferences.of_account(claims.account_name()).await?;
    Ok(Json(
        json!({ "success": true, "accountPreferences": account_preferences }),
    ))
}

pub async fn update_preference(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<UpdatePreferenceRequest>,
) -> Result<impl IntoResponse, DomainError> {
    let account_name = claims.account_name();
    let domain_name = domain_of(body.domain_name, body.domain_id)
        .ok_or_else(|| DomainError::Validation("domainName is required".to_string()))?;
    require_membership(&claims, &domain_name)?;

    let updates = body
        .preferences
        .resolve_strict(account_name, &domain_name)?;
    state.preferences.apply(&updates).await?;

    Ok(Json(json!({ "success": true })))
}

pub async fn trigger_alert(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<TriggerRequest>,
) -> Result<impl IntoResponse, DomainError> {
    state
        .alerts
        .trigger(
            body.message.as_deref(),
            body.kind.as_deref(),
            body.building_name.as_deref(),
            body.notification_type.as_deref(),
            &claims.raw,
            &Audience::of(&claims),
        )
        .await?;

    Ok(Json(
        json!({ "success": true, "message": "Notification sent" }),
    ))
}

pub async fn push_temperature_alert(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Json(body): Json<TemperatureRequest>,
) -> Result<impl IntoResponse, DomainError> {
    let alert = ManualTemperatureAlert {
        building_id: body.building_id,
        room_id: body.room_id,
        temperature: body.temperature,
        domain_name: domain_of(body.domain_name, body.domain_id),
        notification_type: body.notification_type,
    };
    state
        .alerts
        .push_temperature(&alert, &claims.raw, &Audience::of(&claims))
        .await?;

    Ok(Json(json!({ "success": true })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use axum::body::{Body, to_bytes};
    use axum::http::Request;
    use base64::Engine;
    use base64::engine::general_purpose::STANDARD;
    use serde_json::Value;
    use tower::ServiceExt;

    use crate::adapters::ratelimit::RateLimiter;
    use crate::domain::CLAIMS_HEADER;
    use crate::service::alerts::Alerts;
    use crate::service::fakes::{
        FrozenClock, InMemoryCooldown, InMemoryPreferences, InMemorySubscriptions, RecordingBus,
        RecordingSender, StubDirectory,
    };
    use crate::service::preferences::Preferences;
    use crate::service::push::Push;
    use crate::state::AppState;

    struct Harness {
        state: AppState,
        bus: Arc<RecordingBus>,
        sender: Arc<RecordingSender>,
        subscriptions: Arc<InMemorySubscriptions>,
        stored: Arc<InMemoryPreferences>,
        cooldown: Arc<InMemoryCooldown>,
    }

    fn harness(directory: Arc<StubDirectory>) -> Harness {
        let subscriptions = Arc::new(InMemorySubscriptions::default());
        let stored = Arc::new(InMemoryPreferences::default());
        let bus = Arc::new(RecordingBus::default());
        let sender = Arc::new(RecordingSender::default());
        let cooldown = Arc::new(InMemoryCooldown::default());

        let push = Arc::new(Push::new(
            subscriptions.clone(),
            stored.clone(),
            sender.clone(),
        ));
        let preferences = Arc::new(Preferences::new(subscriptions.clone(), stored.clone()));
        let alerts = Arc::new(Alerts::new(
            bus.clone(),
            cooldown.clone(),
            directory,
            push,
            Arc::new(FrozenClock(1_700_000_000_000)),
        ));

        Harness {
            state: AppState {
                alerts,
                preferences,
                vapid_public_key: "BPublicKey".to_string(),
                rate_limiter: RateLimiter::new(false),
            },
            bus,
            sender,
            subscriptions,

            stored,
            cooldown,
        }
    }

    impl Harness {
        fn endpoints_of(&self, account: &str) -> Vec<String> {
            self.subscriptions
                .subscriptions
                .lock()
                .unwrap()
                .iter()
                .filter(|s| s.account_name == account)
                .map(|s| s.endpoint.clone())
                .collect()
        }

        async fn accounts(&self, domain: &str, notification_type: Option<&str>) -> Vec<String> {
            use crate::service::ports::PreferenceStore;
            self.stored
                .accounts_subscribed_to(domain, notification_type)
                .await
                .unwrap()
        }

        fn published(&self) -> Vec<crate::domain::Notification> {
            self.bus.published.lock().unwrap().clone()
        }

        fn arm_cooldown(&self, key: &str) {
            self.cooldown.active.lock().unwrap().push(key.to_string());
        }
    }

    fn claims_header(account: &str) -> String {
        claims_header_for(account, &["eng", "ops"])
    }

    fn claims_header_for(account: &str, domains: &[&str]) -> String {
        let memberships: Vec<String> = domains
            .iter()
            .map(|d| format!(r#"{{"domain":"{d}","role":"business_admin"}}"#))
            .collect();
        STANDARD.encode(format!(
            r#"{{"sub":"u1","accountName":"{account}","memberships":[{}]}}"#,
            memberships.join(",")
        ))
    }

    fn post_as(uri: &str, header: &str, body: Value) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json")
            .header(CLAIMS_HEADER, header)
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    async fn call(state: &AppState, request: Request<Body>) -> (StatusCode, Value) {
        let response = crate::build_router(state.clone())
            .oneshot(request)
            .await
            .unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, body)
    }

    fn post(uri: &str, account: Option<&str>, body: Value) -> Request<Body> {
        let mut builder = Request::builder()
            .method("POST")
            .uri(uri)
            .header("content-type", "application/json");
        if let Some(account) = account {
            builder = builder.header(CLAIMS_HEADER, claims_header(account));
        }
        builder.body(Body::from(body.to_string())).unwrap()
    }

    fn get(uri: &str, account: Option<&str>) -> Request<Body> {
        let mut builder = Request::builder().method("GET").uri(uri);
        if let Some(account) = account {
            builder = builder.header(CLAIMS_HEADER, claims_header(account));
        }
        builder.body(Body::empty()).unwrap()
    }

    fn valid_subscription() -> Value {
        serde_json::json!({
            "endpoint": "https://push.example/1",
            "keys": { "p256dh": "key", "auth": "auth" }
        })
    }

    #[tokio::test]
    async fn the_health_probe_needs_no_authentication() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, _) = call(&harness.state, get("/health", None)).await;
        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn the_public_key_is_served_without_authentication() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, body) = call(&harness.state, get("/public-key", None)).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["publicVapidKey"], "BPublicKey");
    }

    #[tokio::test]
    async fn every_other_route_rejects_a_request_without_claims() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        for request in [
            post("/subscribe", None, valid_subscription()),
            get("/preferences", None),
            post("/preferences", None, serde_json::json!({})),
            post("/trigger", None, serde_json::json!({})),
            post("/push/temperature", None, serde_json::json!({})),
        ] {
            let (status, _) = call(&harness.state, request).await;
            assert_eq!(status, StatusCode::UNAUTHORIZED);
        }
    }

    #[tokio::test]
    async fn subscribing_stores_the_device_against_the_authenticated_account() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, body) = call(
            &harness.state,
            post("/subscribe", Some("ada"), valid_subscription()),
        )
        .await;

        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(body["success"], true);
        assert_eq!(harness.endpoints_of("ada"), vec!["https://push.example/1"]);
    }

    #[tokio::test]
    async fn a_body_account_name_never_overrides_the_authenticated_one() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let mut body = valid_subscription();
        body["accountName"] = serde_json::json!("mallory");

        call(&harness.state, post("/subscribe", Some("ada"), body)).await;

        assert!(harness.endpoints_of("mallory").is_empty());
        assert_eq!(harness.endpoints_of("ada").len(), 1);
    }

    #[tokio::test]
    async fn a_nested_subscription_object_is_accepted() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let body = serde_json::json!({ "subscription": valid_subscription() });

        let (status, _) = call(&harness.state, post("/subscribe", Some("ada"), body)).await;

        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(harness.endpoints_of("ada").len(), 1);
    }

    #[tokio::test]
    async fn a_subscription_without_keys_is_a_validation_error() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let body = serde_json::json!({ "endpoint": "https://push.example/1" });

        let (status, body) = call(&harness.state, post("/subscribe", Some("ada"), body)).await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["message"], "Invalid push subscription payload");
        assert_eq!(body["type"], "Validation Error");
    }

    #[tokio::test]
    async fn subscribing_with_a_domain_defaults_to_an_enabled_temperature_preference() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let mut body = valid_subscription();
        body["domainName"] = serde_json::json!("eng");

        call(&harness.state, post("/subscribe", Some("ada"), body)).await;

        assert_eq!(
            harness.accounts("eng", Some("temperature")).await,
            vec!["ada".to_string()]
        );
    }

    #[tokio::test]
    async fn subscribing_without_a_domain_records_no_preference() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        call(
            &harness.state,
            post("/subscribe", Some("ada"), valid_subscription()),
        )
        .await;

        assert!(harness.accounts("eng", None).await.is_empty());
    }

    #[tokio::test]
    async fn reading_preferences_ignores_the_account_name_in_the_url() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let mut body = valid_subscription();
        body["domainName"] = serde_json::json!("eng");
        call(&harness.state, post("/subscribe", Some("ada"), body)).await;

        let (status, body) = call(&harness.state, get("/preferences/mallory", Some("ada"))).await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["accountPreferences"][0]["accountName"], "ada");
    }

    #[tokio::test]
    async fn updating_a_preference_without_a_domain_is_a_validation_error() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, body) = call(
            &harness.state,
            post(
                "/preferences",
                Some("ada"),
                serde_json::json!({ "enabled": true }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["message"], "domainName is required");
    }

    #[tokio::test]
    async fn updating_a_preference_without_an_enabled_flag_is_a_validation_error() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, body) = call(
            &harness.state,
            post(
                "/preferences",
                Some("ada"),
                serde_json::json!({ "domainName": "eng" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["message"], "enabled is required");
    }

    #[tokio::test]
    async fn a_domain_id_is_accepted_in_place_of_a_domain_name() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, _) = call(
            &harness.state,
            post(
                "/preferences",
                Some("ada"),
                serde_json::json!({ "domainId": "eng", "enabled": true }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            harness.accounts("eng", Some("temperature")).await,
            vec!["ada".to_string()]
        );
    }

    #[tokio::test]
    async fn triggering_an_alert_without_a_building_name_is_a_validation_error() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, body) = call(
            &harness.state,
            post("/trigger", Some("ada"), serde_json::json!({})),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["message"], "Missing required field: buildingName");
    }

    #[tokio::test]
    async fn triggering_an_alert_publishes_to_every_domain_of_the_building() {
        let directory = Arc::new(StubDirectory::returning("b1", &["eng", "ops"]));
        let harness = harness(directory.clone());

        let (status, body) = call(
            &harness.state,
            post(
                "/trigger",
                Some("ada"),
                serde_json::json!({ "buildingName": "b1" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["message"], "Notification sent");
        let published = harness.published();
        assert_eq!(published.len(), 2);
        assert_eq!(published[0].message, "Manual Alert Triggered");
        assert_eq!(published[0].kind, "alert");
    }

    #[tokio::test]
    async fn triggering_an_alert_forwards_the_callers_claims_header_to_the_directory() {
        let directory = Arc::new(StubDirectory::returning("b1", &["eng"]));
        let harness = harness(directory.clone());

        call(
            &harness.state,
            post(
                "/trigger",
                Some("ada"),
                serde_json::json!({ "buildingName": "b1" }),
            ),
        )
        .await;

        assert_eq!(
            *directory.calls.lock().unwrap(),
            vec![("b1".to_string(), claims_header("ada"))]
        );
    }

    #[tokio::test]
    async fn a_failing_building_lookup_on_trigger_is_a_server_error() {
        let harness = harness(Arc::new(StubDirectory::failing()));
        let (status, body) = call(
            &harness.state,
            post(
                "/trigger",
                Some("ada"),
                serde_json::json!({ "buildingName": "b1" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["type"], "Internal Server Error");
    }

    #[tokio::test]
    async fn a_manual_temperature_push_reaches_the_supplied_domain() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let mut body = valid_subscription();
        body["domainName"] = serde_json::json!("eng");
        call(&harness.state, post("/subscribe", Some("ada"), body)).await;

        let (status, _) = call(
            &harness.state,
            post(
                "/push/temperature",
                Some("ada"),
                serde_json::json!({ "domainName": "eng", "roomId": "r1", "temperature": 31.5 }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            harness.published()[0].message,
            "Temperature alert in room r1: 31.5 C"
        );
        assert_eq!(harness.sender.endpoints(), vec!["https://push.example/1"]);
    }

    #[tokio::test]
    async fn a_manual_temperature_push_without_any_target_is_a_validation_error() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let (status, body) = call(
            &harness.state,
            post("/push/temperature", Some("ada"), serde_json::json!({})),
        )
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(
            body["message"],
            "domainName/domainId (or buildingId fallback) is required"
        );
    }

    #[tokio::test]
    async fn a_manual_temperature_push_inside_the_cooldown_is_silently_accepted() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        harness.arm_cooldown("temp_alert:b1:r1");

        let (status, _) = call(
            &harness.state,
            post(
                "/push/temperature",
                Some("ada"),
                serde_json::json!({ "buildingId": "b1", "roomId": "r1", "domainName": "eng" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert!(harness.published().is_empty());
    }

    #[tokio::test]
    async fn subscribing_to_a_domain_the_caller_is_not_a_member_of_is_forbidden() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let mut body = valid_subscription();
        body["domainName"] = serde_json::json!("finance");

        let (status, response) = call(
            &harness.state,
            post_as("/subscribe", &claims_header_for("ada", &["eng"]), body),
        )
        .await;

        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(response["type"], "Forbidden Error");
        assert!(harness.accounts("finance", None).await.is_empty());
    }

    #[tokio::test]
    async fn a_forbidden_domain_still_leaves_the_device_registered() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let mut body = valid_subscription();
        body["domainName"] = serde_json::json!("finance");

        call(
            &harness.state,
            post_as("/subscribe", &claims_header_for("ada", &["eng"]), body),
        )
        .await;

        assert_eq!(harness.endpoints_of("ada").len(), 1);
    }

    #[tokio::test]
    async fn updating_a_preference_for_a_foreign_domain_is_forbidden() {
        let harness = harness(Arc::new(StubDirectory::empty()));

        let (status, _) = call(
            &harness.state,
            post_as(
                "/preferences",
                &claims_header_for("ada", &["eng"]),
                serde_json::json!({ "domainName": "finance", "enabled": true }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(harness.accounts("finance", None).await.is_empty());
    }

    #[tokio::test]
    async fn a_manual_push_to_a_foreign_domain_is_forbidden() {
        let harness = harness(Arc::new(StubDirectory::empty()));

        let (status, _) = call(
            &harness.state,
            post_as(
                "/push/temperature",
                &claims_header_for("ada", &["eng"]),
                serde_json::json!({ "domainName": "finance", "roomId": "r1", "temperature": 31.5 }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(harness.published().is_empty());
        assert!(harness.sender.endpoints().is_empty());
    }

    #[tokio::test]
    async fn triggering_only_reaches_the_buildings_domains_the_caller_belongs_to() {
        let directory = Arc::new(StubDirectory::returning("b1", &["eng", "finance"]));
        let harness = harness(directory);

        let (status, _) = call(
            &harness.state,
            post_as(
                "/trigger",
                &claims_header_for("ada", &["eng"]),
                serde_json::json!({ "buildingName": "b1" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        let published = harness.published();
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].domain_name.as_deref(), Some("eng"));
    }

    #[tokio::test]
    async fn triggering_for_a_building_in_no_shared_domain_is_forbidden() {
        let directory = Arc::new(StubDirectory::returning("b1", &["finance"]));
        let harness = harness(directory);

        let (status, _) = call(
            &harness.state,
            post_as(
                "/trigger",
                &claims_header_for("ada", &["eng"]),
                serde_json::json!({ "buildingName": "b1" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(harness.published().is_empty());
    }

    fn admin_header(account: &str) -> String {
        STANDARD.encode(format!(
            r#"{{"sub":"3f2b","accountName":"{account}","memberships":[{{"domain":"eng","role":"admin"}}]}}"#
        ))
    }

    #[tokio::test]
    async fn a_global_admin_can_trigger_for_a_building_outside_their_own_domains() {
        let directory = Arc::new(StubDirectory::returning("b1", &["finance"]));
        let harness = harness(directory);

        let (status, _) = call(
            &harness.state,
            post_as(
                "/trigger",
                &admin_header("root"),
                serde_json::json!({ "buildingName": "b1" }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            harness.published()[0].domain_name.as_deref(),
            Some("finance")
        );
    }

    #[tokio::test]
    async fn a_global_admin_may_set_preferences_for_any_domain() {
        let harness = harness(Arc::new(StubDirectory::empty()));

        let (status, _) = call(
            &harness.state,
            post_as(
                "/preferences",
                &admin_header("root"),
                serde_json::json!({ "domainName": "finance", "enabled": true }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            harness.accounts("finance", Some("temperature")).await,
            vec!["root".to_string()]
        );
    }

    #[tokio::test]
    async fn digital_twins_provisioning_failure_alert_still_reaches_every_domain() {
        let directory = Arc::new(StubDirectory::returning("b1", &["eng", "finance"]));
        let harness = harness(directory);
        let system = STANDARD.encode(
            r#"{"sub":"system:digital-twin","accountName":"system:digital-twin","memberships":[]}"#,
        );

        let (status, _) = call(
            &harness.state,
            post_as(
                "/trigger",
                &system,
                serde_json::json!({
                    "buildingName": "b1",
                    "message": "Provisioning failed for building b1: boom",
                    "type": "danger",
                }),
            ),
        )
        .await;

        assert_eq!(status, StatusCode::OK);
        let published = harness.published();
        assert_eq!(published.len(), 2);
        assert_eq!(
            published[0].message,
            "Provisioning failed for building b1: boom"
        );
        assert_eq!(published[0].kind, "danger");
    }

    #[tokio::test]
    async fn an_undecodable_claims_header_is_unauthorized() {
        let harness = harness(Arc::new(StubDirectory::empty()));
        let request = Request::builder()
            .method("GET")
            .uri("/preferences")
            .header(CLAIMS_HEADER, "!!!not base64!!!")
            .body(Body::empty())
            .unwrap();

        let (status, body) = call(&harness.state, request).await;

        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(body["message"], "Invalid authentication token");
    }
}
