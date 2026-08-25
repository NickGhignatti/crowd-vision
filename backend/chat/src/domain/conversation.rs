use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use time::format_description::BorrowedFormatItem;
use time::macros::format_description;

use crate::domain::DomainError;

pub const MAX_MESSAGES: usize = 100;
pub const MAX_MESSAGE_LENGTH: usize = 8000;
pub const MAX_TITLE_LENGTH: usize = 120;
pub const DEFAULT_TITLE: &str = "New chat";

const JS_ISO: &[BorrowedFormatItem] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z");

pub fn iso8601(millis: i64) -> String {
    OffsetDateTime::from_unix_timestamp_nanos(millis as i128 * 1_000_000)
        .expect("millisecond timestamps are in range")
        .format(JS_ISO)
        .expect("format is total over valid datetimes")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    User,
    Assistant,
}

/// Field names stay snake_case: they are agent's Python payload, stored and
/// returned unchanged. A blanket camelCase rename would break every citation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Citation {
    pub chunk_id: String,
    pub document_id: String,
    pub source: String,
    #[serde(default)]
    pub section_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatMessage {
    #[serde(rename = "_id")]
    pub id: String,
    pub role: Role,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub citations: Option<Vec<Citation>>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewMessage {
    pub role: Role,
    pub content: String,
    pub citations: Option<Vec<Citation>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Conversation {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub title: String,
    pub messages: Vec<ChatMessage>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConversationSummary {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    pub title: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct HistoryTurn {
    pub role: Role,
    pub content: String,
}

/// An absent `title` field is not the same as a `title` that is present and null:
/// the first defaults, the second is a validation error.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TitleField<'a> {
    Absent,
    Present(Option<&'a str>),
}

/// Trims first, then length-checks the trimmed value, so trailing whitespace never
/// pushes an otherwise-valid message over the limit.
pub fn validate_text(
    value: Option<&str>,
    name: &str,
    max_length: usize,
) -> Result<String, DomainError> {
    let text = value
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| DomainError::Validation(format!("{name} must be a non-empty string")))?;

    if text.chars().count() > max_length {
        return Err(DomainError::Validation(format!(
            "{name} cannot exceed {max_length} characters"
        )));
    }
    Ok(text.to_string())
}

impl Conversation {
    pub fn has_room_for_exchange(&self) -> bool {
        self.messages.len() + 2 <= MAX_MESSAGES
    }

    pub fn recent_history(&self, limit: usize) -> Vec<HistoryTurn> {
        self.messages
            .iter()
            .skip(self.messages.len().saturating_sub(limit))
            .map(|m| HistoryTurn {
                role: m.role,
                content: m.content.clone(),
            })
            .collect()
    }

    /// The first exchange renames an untitled conversation after the question that
    /// started it; every later exchange leaves the title alone.
    pub fn title_from_first_question(&self, question: &str) -> Option<String> {
        if self.title != DEFAULT_TITLE || !self.messages.is_empty() {
            return None;
        }
        Some(question.chars().take(MAX_TITLE_LENGTH).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: Role, content: &str) -> ChatMessage {
        ChatMessage {
            id: "000000000000000000000001".to_string(),
            role,
            content: content.to_string(),
            citations: None,
            created_at: iso8601(0),
        }
    }

    fn conversation(title: &str, messages: Vec<ChatMessage>) -> Conversation {
        Conversation {
            id: "65f0000000000000000000aa".to_string(),
            user_id: "ada".to_string(),
            title: title.to_string(),
            messages,
            created_at: iso8601(0),
            updated_at: iso8601(0),
        }
    }

    #[test]
    fn timestamps_render_the_way_the_node_service_rendered_them() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso8601(1_755_770_400_123), "2025-08-21T10:00:00.123Z");
    }

    #[test]
    fn a_conversation_serialises_id_as_a_bare_string() {
        let json = serde_json::to_value(conversation(DEFAULT_TITLE, vec![])).unwrap();
        assert_eq!(json["_id"], "65f0000000000000000000aa");
    }

    #[test]
    fn every_message_carries_its_own_id_as_a_bare_string() {
        let json =
            serde_json::to_value(conversation(DEFAULT_TITLE, vec![message(Role::User, "hi")]))
                .unwrap();
        assert_eq!(json["messages"][0]["_id"], "000000000000000000000001");
    }

    #[test]
    fn citation_fields_stay_snake_case() {
        let json = serde_json::to_value(Citation {
            chunk_id: "c".to_string(),
            document_id: "d".to_string(),
            source: "s".to_string(),
            section_path: Some("Top > Sub".to_string()),
        })
        .unwrap();

        for field in ["chunk_id", "document_id", "source", "section_path"] {
            assert!(json.get(field).is_some(), "{field} must stay snake_case");
        }
    }

    #[test]
    fn a_missing_section_path_serialises_as_null_rather_than_vanishing() {
        let json = serde_json::to_value(Citation {
            chunk_id: "c".to_string(),
            document_id: "d".to_string(),
            source: "s".to_string(),
            section_path: None,
        })
        .unwrap();
        assert_eq!(json["section_path"], serde_json::Value::Null);
    }

    #[test]
    fn a_message_without_citations_omits_the_field_entirely() {
        let json = serde_json::to_value(message(Role::User, "hi")).unwrap();
        assert!(json.get("citations").is_none());
    }

    #[test]
    fn roles_serialise_lowercase() {
        assert_eq!(serde_json::to_value(Role::Assistant).unwrap(), "assistant");
    }

    #[test]
    fn blank_and_missing_text_are_rejected_with_the_same_message() {
        for value in [None, Some(""), Some("   ")] {
            assert!(matches!(
                validate_text(value, "content", 10),
                Err(DomainError::Validation(m)) if m == "content must be a non-empty string"
            ));
        }
    }

    #[test]
    fn text_is_trimmed_before_it_is_measured() {
        let padded = format!("  {}  ", "a".repeat(10));
        assert_eq!(
            validate_text(Some(&padded), "content", 10).unwrap(),
            "a".repeat(10)
        );
    }

    #[test]
    fn text_longer_than_the_limit_is_rejected() {
        assert!(matches!(
            validate_text(Some(&"a".repeat(11)), "title", 10),
            Err(DomainError::Validation(m)) if m == "title cannot exceed 10 characters"
        ));
    }

    #[test]
    fn a_conversation_below_the_cap_has_room_for_one_more_exchange() {
        let messages = vec![message(Role::User, "hi"); MAX_MESSAGES - 2];
        assert!(conversation(DEFAULT_TITLE, messages).has_room_for_exchange());
    }

    #[test]
    fn a_conversation_one_exchange_from_the_cap_has_no_room() {
        let messages = vec![message(Role::User, "hi"); MAX_MESSAGES - 1];
        assert!(!conversation(DEFAULT_TITLE, messages).has_room_for_exchange());
    }

    #[test]
    fn history_is_capped_at_the_most_recent_turns() {
        let messages = (0..10)
            .map(|i| message(Role::User, &i.to_string()))
            .collect();
        let history = conversation(DEFAULT_TITLE, messages).recent_history(3);

        assert_eq!(history.len(), 3);
        assert_eq!(history[0].content, "7");
        assert_eq!(history[2].content, "9");
    }

    #[test]
    fn a_short_conversation_forwards_every_turn_it_has() {
        let messages = vec![message(Role::User, "a"), message(Role::Assistant, "b")];
        assert_eq!(
            conversation(DEFAULT_TITLE, messages)
                .recent_history(10)
                .len(),
            2
        );
    }

    #[test]
    fn the_first_question_titles_an_untitled_conversation() {
        assert_eq!(
            conversation(DEFAULT_TITLE, vec![]).title_from_first_question("how many rooms?"),
            Some("how many rooms?".to_string())
        );
    }

    #[test]
    fn a_long_first_question_is_cut_to_the_title_limit() {
        let title = conversation(DEFAULT_TITLE, vec![])
            .title_from_first_question(&"q".repeat(500))
            .unwrap();
        assert_eq!(title.chars().count(), MAX_TITLE_LENGTH);
    }

    #[test]
    fn an_already_named_conversation_keeps_its_title() {
        assert_eq!(
            conversation("Rooms", vec![]).title_from_first_question("how many rooms?"),
            None
        );
    }

    #[test]
    fn a_later_exchange_never_retitles_the_conversation() {
        let started = conversation(DEFAULT_TITLE, vec![message(Role::User, "hi")]);
        assert_eq!(started.title_from_first_question("second question"), None);
    }
}
