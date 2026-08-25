use std::convert::Infallible;

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use futures::{Stream, StreamExt};
use serde_json::{Value, json};

use crate::domain::{Conversation, ConversationSummary, DomainError, GatewayClaims, TitleField};
use crate::service::conversations::ChatEvent;
use crate::state::AppState;

/// A body that is absent or unreadable is treated as an empty one, exactly as
/// `req.body?.field` did — the field-level validation then produces the message the
/// client used to get, instead of a framework rejection in a different shape.
///
/// The body stays a `Value` rather than a typed struct because `Option<T>` cannot
/// tell an absent field from an explicit `null`, and `title` needs that distinction:
/// absent defaults to "New chat", `null` is a validation error.
fn payload(body: Result<Json<Value>, JsonRejection>) -> Value {
    body.map(|Json(value)| value).unwrap_or(Value::Null)
}

/// `None` only when the field is absent; a present-but-non-string value (`null`
/// included) yields `Some(_)`-shaped failure downstream via `validate_text`.
fn field<'a>(body: &'a Value, name: &str) -> Option<&'a Value> {
    body.get(name)
}

fn text<'a>(body: &'a Value, name: &str) -> Option<&'a str> {
    field(body, name).and_then(Value::as_str)
}

pub async fn create_conversation(
    State(state): State<AppState>,
    claims: GatewayClaims,
    body: Result<Json<Value>, JsonRejection>,
) -> Result<(StatusCode, Json<Conversation>), DomainError> {
    let request = payload(body);
    let title = match field(&request, "title") {
        None => TitleField::Absent,
        Some(value) => TitleField::Present(value.as_str()),
    };

    let conversation = state.conversations.create(&claims.user_id, title).await?;
    Ok((StatusCode::CREATED, Json(conversation)))
}

pub async fn list_conversations(
    State(state): State<AppState>,
    claims: GatewayClaims,
) -> Result<Json<Value>, DomainError> {
    let conversations: Vec<ConversationSummary> = state.conversations.list(&claims.user_id).await?;
    Ok(Json(json!({ "conversations": conversations })))
}

pub async fn get_conversation(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Path(id): Path<String>,
) -> Result<Json<Conversation>, DomainError> {
    Ok(Json(state.conversations.open(&claims.user_id, &id).await?))
}

pub async fn rename_conversation(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Path(id): Path<String>,
    body: Result<Json<Value>, JsonRejection>,
) -> Result<Json<Conversation>, DomainError> {
    let request = payload(body);
    let conversation = state
        .conversations
        .rename(&claims.user_id, &id, text(&request, "title"))
        .await?;
    Ok(Json(conversation))
}

pub async fn delete_conversation(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Path(id): Path<String>,
) -> Result<StatusCode, DomainError> {
    state.conversations.delete(&claims.user_id, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

fn frame(event: Result<ChatEvent, DomainError>) -> Event {
    let body = match event {
        Ok(ChatEvent::Token(text)) => json!({ "type": "token", "text": text }),
        Ok(ChatEvent::Done(message)) => json!({ "type": "done", "message": message }),
        Err(error) => {
            let (_, error_type, message) = error.describe();
            json!({ "type": "error", "error": error_type, "message": message })
        }
    };
    Event::default().json_data(body).unwrap_or_else(|_| {
        Event::default().data(r#"{"type":"error","error":"Internal Server Error"}"#)
    })
}

/// Errors that are knowable before generation starts still answer with a status code;
/// the SSE body only begins once agent has accepted the question. A failure
/// after that arrives as a terminal `error` frame, because the status line is long gone.
pub async fn send_message(
    State(state): State<AppState>,
    claims: GatewayClaims,
    Path(id): Path<String>,
    body: Result<Json<Value>, JsonRejection>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, DomainError> {
    let request = payload(body);
    let events = state
        .conversations
        .send_message(&claims.user_id, &id, text(&request, "content"), &claims.raw)
        .await?;

    Ok(Sse::new(events.map(|event| Ok(frame(event)))).keep_alive(KeepAlive::default()))
}
