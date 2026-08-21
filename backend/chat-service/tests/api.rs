use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use mongodb::Database;
use serde_json::{Value, json};
use tower::ServiceExt;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

use chat_service::adapters::driven::agent::AgentService;
use chat_service::adapters::driven::persistence::conversations::MongoConversations;
use chat_service::adapters::driven::persistence::db;
use chat_service::adapters::ratelimit::RateLimiter;
use chat_service::build_router;
use chat_service::service::conversations::Conversations;
use chat_service::state::AppState;

static COUNTER: AtomicUsize = AtomicUsize::new(0);

/// A client per test, because `#[tokio::test]` tears its runtime down afterwards and
/// takes the client's topology-monitoring tasks with it — a shared client survives
/// the first test and then reports no suitable server to every later one.
async fn database() -> Database {
    let base =
        std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
    let name = format!("chat_test_{}", COUNTER.fetch_add(1, Ordering::SeqCst));
    let uri = format!("{}/{}", base.trim_end_matches('/'), name);

    let database = db::connect(&uri).await.expect("mongodb is reachable");
    database.drop().await.expect("a test database can be reset");
    database
}

struct TestApp {
    router: Router,
    agent: MockServer,
}

fn claims(user_id: &str) -> String {
    STANDARD.encode(format!(
        r#"{{"sub":"{user_id}","accountName":"ada","memberships":[]}}"#
    ))
}

fn sse(frames: &[Value]) -> String {
    frames
        .iter()
        .map(|frame| format!("data: {frame}\n\n"))
        .collect()
}

fn tokens_then_done(text: &str, citations: Value) -> String {
    sse(&[
        json!({ "type": "token", "text": text }),
        json!({ "type": "done", "citations": citations }),
    ])
}

async fn app_with_agent(response: ResponseTemplate) -> TestApp {
    let agent = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/ask"))
        .respond_with(response)
        .mount(&agent)
        .await;

    let database = database().await;
    let conversations = Arc::new(Conversations::new(
        Arc::new(MongoConversations::new(&database)),
        Arc::new(AgentService::new(agent.uri())),
        10,
    ));

    TestApp {
        router: build_router(AppState {
            conversations,
            rate_limiter: RateLimiter::new(false),
        }),
        agent,
    }
}

async fn app() -> TestApp {
    app_with_agent(ResponseTemplate::new(200).set_body_raw(
        tokens_then_done("Room B2 is full.", json!([])),
        "text/event-stream",
    ))
    .await
}

impl TestApp {
    async fn send(
        &self,
        method: &str,
        uri: &str,
        user: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, String) {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(user) = user {
            request = request.header("x-gateway-claims", claims(user));
        }
        let request = match body {
            Some(body) => request
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
            None => request.body(Body::empty()).unwrap(),
        };

        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    }

    async fn json(
        &self,
        method: &str,
        uri: &str,
        user: &str,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let (status, text) = self.send(method, uri, Some(user), body).await;
        let value = serde_json::from_str(&text).unwrap_or(Value::Null);
        (status, value)
    }

    async fn conversation(&self, user: &str) -> String {
        let (status, body) = self
            .json("POST", "/conversations", user, Some(json!({})))
            .await;
        body["_id"]
            .as_str()
            .unwrap_or_else(|| panic!("create failed with {status}: {body}"))
            .to_string()
    }
}

/// Parses an SSE response body back into the JSON payload of each `data:` frame.
fn frames(body: &str) -> Vec<Value> {
    body.split("\n\n")
        .filter_map(|block| {
            let payload: String = block
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(|value| value.trim_start())
                .collect();
            serde_json::from_str(&payload).ok()
        })
        .collect()
}

fn is_bare_object_id(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|id| id.len() == 24 && id.chars().all(|c| c.is_ascii_hexdigit()))
}

#[tokio::test]
async fn a_new_conversation_comes_back_with_a_bare_string_id_and_the_default_title() {
    let app = app().await;

    let (status, body) = app
        .json("POST", "/conversations", "ada", Some(json!({})))
        .await;

    assert_eq!(status, StatusCode::CREATED);
    assert!(
        is_bare_object_id(&body["_id"]),
        "_id must be a bare hex string, got {}",
        body["_id"]
    );
    assert_eq!(body["title"], "New chat");
    assert_eq!(body["messages"], json!([]));
    assert!(body["createdAt"].as_str().unwrap().ends_with('Z'));
}

#[tokio::test]
async fn a_supplied_title_is_kept_and_a_null_one_is_rejected() {
    let app = app().await;

    let (status, body) = app
        .json(
            "POST",
            "/conversations",
            "ada",
            Some(json!({"title": "Rooms"})),
        )
        .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["title"], "Rooms");

    let (status, body) = app
        .json(
            "POST",
            "/conversations",
            "ada",
            Some(json!({"title": null})),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["type"], "Validation Error");
    assert_eq!(body["message"], "title must be a non-empty string");
}

#[tokio::test]
async fn the_conversation_list_omits_messages_and_leads_with_the_most_recent() {
    let app = app().await;
    let older = app.conversation("ada").await;
    let newer = app.conversation("ada").await;
    app.json(
        "PATCH",
        &format!("/conversations/{older}"),
        "ada",
        Some(json!({"title": "bumped"})),
    )
    .await;

    let (status, body) = app.json("GET", "/conversations", "ada", None).await;
    let listed = body["conversations"].as_array().unwrap();

    assert_eq!(status, StatusCode::OK);
    assert_eq!(listed.len(), 2);
    assert_eq!(
        listed[0]["_id"], older,
        "a renamed conversation moves to the top"
    );
    assert_eq!(listed[1]["_id"], newer);
    assert!(listed[0].get("messages").is_none());
    assert!(is_bare_object_id(&listed[0]["_id"]));
}

#[tokio::test]
async fn another_accounts_conversation_is_invisible_rather_than_forbidden() {
    let app = app().await;
    let hers = app.conversation("ada").await;

    for (method, body) in [
        ("GET", None),
        ("PATCH", Some(json!({"title": "mine"}))),
        ("DELETE", None),
    ] {
        let (status, _) = app
            .json(method, &format!("/conversations/{hers}"), "bob", body)
            .await;
        assert_eq!(
            status,
            StatusCode::NOT_FOUND,
            "{method} must not leak existence"
        );
    }
}

#[tokio::test]
async fn an_id_that_is_not_an_object_id_is_a_404_not_a_400() {
    let app = app().await;

    let (status, body) = app
        .json("GET", "/conversations/not-an-id", "ada", None)
        .await;

    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["type"], "Not Found Error");
    assert_eq!(body["message"], "Conversation not found");
}

#[tokio::test]
async fn a_conversation_can_be_renamed_and_then_deleted() {
    let app = app().await;
    let id = app.conversation("ada").await;

    let (status, body) = app
        .json(
            "PATCH",
            &format!("/conversations/{id}"),
            "ada",
            Some(json!({"title": "  Rooms  "})),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["title"], "Rooms");

    let (status, _) = app
        .send("DELETE", &format!("/conversations/{id}"), Some("ada"), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) = app
        .json("GET", &format!("/conversations/{id}"), "ada", None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn every_request_needs_the_gateway_claims_header() {
    let app = app().await;

    let (status, text) = app.send("GET", "/conversations", None, None).await;
    let body: Value = serde_json::from_str(&text).unwrap();

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["type"], "Unauthorized Error");
    assert_eq!(body["message"], "Missing authentication token");
}

#[tokio::test]
async fn health_and_metrics_stay_open() {
    let app = app().await;

    assert_eq!(
        app.send("GET", "/health", None, None).await.0,
        StatusCode::OK
    );
    app.json("GET", "/conversations", "ada", None).await;
    let (status, body) = app.send("GET", "/metrics", None, None).await;

    assert_eq!(status, StatusCode::OK);
    assert!(
        body.contains("chat_http_requests_total"),
        "prometheus.rules.yml alerts on this exact name"
    );
}

#[tokio::test]
async fn the_answer_streams_as_tokens_and_ends_with_the_stored_message() {
    let app = app_with_agent(ResponseTemplate::new(200).set_body_raw(
        sse(&[
            json!({ "type": "token", "text": "Room " }),
            json!({ "type": "token", "text": "B2 " }),
            json!({ "type": "token", "text": "is full." }),
            json!({ "type": "done", "citations": [
                {"chunk_id": "c1", "document_id": "d1", "source": "handbook.md", "section_path": "Rooms > B2"}
            ]}),
        ]),
        "text/event-stream",
    ))
    .await;
    let id = app.conversation("ada").await;

    let (status, body) = app
        .send(
            "POST",
            &format!("/conversations/{id}/messages"),
            Some("ada"),
            Some(json!({"content": "which room is full?"})),
        )
        .await;
    let frames = frames(&body);

    assert_eq!(status, StatusCode::OK);
    assert_eq!(frames.len(), 4);
    assert_eq!(frames[0], json!({"type": "token", "text": "Room "}));
    assert_eq!(frames[2]["text"], "is full.");

    let message = &frames[3]["message"];
    assert_eq!(frames[3]["type"], "done");
    assert_eq!(message["content"], "Room B2 is full.");
    assert_eq!(message["role"], "assistant");
    assert!(
        is_bare_object_id(&message["_id"]),
        "an embedded message id must be a bare string too, got {}",
        message["_id"]
    );
    assert_eq!(message["citations"][0]["chunk_id"], "c1");
    assert_eq!(message["citations"][0]["document_id"], "d1");
    assert_eq!(message["citations"][0]["section_path"], "Rooms > B2");
}

#[tokio::test]
async fn the_completed_exchange_is_persisted_and_titles_the_conversation() {
    let app = app().await;
    let id = app.conversation("ada").await;

    app.send(
        "POST",
        &format!("/conversations/{id}/messages"),
        Some("ada"),
        Some(json!({"content": "which room is full?"})),
    )
    .await;

    let (_, body) = app
        .json("GET", &format!("/conversations/{id}"), "ada", None)
        .await;
    let messages = body["messages"].as_array().unwrap();

    assert_eq!(body["title"], "which room is full?");
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"], "which room is full?");
    assert!(messages[0].get("citations").is_none());
    assert_eq!(messages[1]["content"], "Room B2 is full.");
    assert!(is_bare_object_id(&messages[0]["_id"]));
    assert!(is_bare_object_id(&messages[1]["_id"]));
}

#[tokio::test]
async fn sending_a_message_advances_updated_at_so_the_list_keeps_reordering() {
    let app = app().await;
    let first = app.conversation("ada").await;
    let second = app.conversation("ada").await;

    app.send(
        "POST",
        &format!("/conversations/{first}/messages"),
        Some("ada"),
        Some(json!({"content": "hello"})),
    )
    .await;

    let (_, body) = app.json("GET", "/conversations", "ada", None).await;
    let listed = body["conversations"].as_array().unwrap();

    assert_eq!(listed[0]["_id"], first);
    assert_eq!(listed[1]["_id"], second);
}

#[tokio::test]
async fn an_agent_that_rejects_the_question_fails_before_the_stream_opens() {
    let app = app_with_agent(ResponseTemplate::new(500)).await;
    let id = app.conversation("ada").await;

    let (status, body) = app
        .json(
            "POST",
            &format!("/conversations/{id}/messages"),
            "ada",
            Some(json!({"content": "hello"})),
        )
        .await;

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert_eq!(body["type"], "Bad Gateway Error");
    assert_eq!(body["message"], "agent-service returned 500");
}

#[tokio::test]
async fn a_stream_that_never_terminates_persists_nothing_and_ends_in_an_error_frame() {
    let app = app_with_agent(ResponseTemplate::new(200).set_body_raw(
        sse(&[json!({ "type": "token", "text": "half an answ" })]),
        "text/event-stream",
    ))
    .await;
    let id = app.conversation("ada").await;

    let (status, body) = app
        .send(
            "POST",
            &format!("/conversations/{id}/messages"),
            Some("ada"),
            Some(json!({"content": "hello"})),
        )
        .await;
    let frames = frames(&body);

    assert_eq!(status, StatusCode::OK, "the response had already begun");
    assert_eq!(frames.last().unwrap()["type"], "error");
    assert_eq!(frames.last().unwrap()["error"], "Bad Gateway Error");

    let (_, conversation) = app
        .json("GET", &format!("/conversations/{id}"), "ada", None)
        .await;
    assert_eq!(
        conversation["messages"],
        json!([]),
        "an unterminated stream must not leave a half-written exchange"
    );
    assert_eq!(conversation["title"], "New chat");
}

#[tokio::test]
async fn empty_content_is_rejected_with_a_status_code_not_a_stream() {
    let app = app().await;
    let id = app.conversation("ada").await;

    let (status, body) = app
        .json(
            "POST",
            &format!("/conversations/{id}/messages"),
            "ada",
            Some(json!({"content": "   "})),
        )
        .await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["message"], "content must be a non-empty string");
}

#[tokio::test]
async fn the_history_window_and_claims_header_reach_the_agent() {
    let app = app_with_agent(ResponseTemplate::new(200).set_body_raw(
        tokens_then_done("second answer", json!([])),
        "text/event-stream",
    ))
    .await;

    let id = app.conversation("ada").await;
    for question in ["first", "second"] {
        app.send(
            "POST",
            &format!("/conversations/{id}/messages"),
            Some("ada"),
            Some(json!({ "content": question })),
        )
        .await;
    }

    let requests = app.agent.received_requests().await.unwrap();
    let second: Value = serde_json::from_slice(&requests[1].body).unwrap();

    assert_eq!(second["question"], "second");
    assert_eq!(second["stream"], true);
    assert_eq!(second["history"].as_array().unwrap().len(), 2);
    assert_eq!(second["history"][0]["role"], "user");
    assert_eq!(second["history"][0]["content"], "first");
    assert_eq!(second["history"][1]["role"], "assistant");
    assert_eq!(
        requests[1].headers["x-gateway-claims"],
        claims("ada"),
        "the caller's own claims are forwarded verbatim"
    );
}
