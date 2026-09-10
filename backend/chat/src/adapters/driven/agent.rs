use std::collections::VecDeque;
use std::pin::Pin;
use std::time::Duration;

use async_trait::async_trait;
use bytes::Bytes;
use futures::{Stream, StreamExt};
use serde::{Deserialize, Serialize};

use crate::domain::{CLAIMS_HEADER, Citation, DomainError, HistoryTurn};
use crate::service::ports::{AgentClient, AgentEvent, AnswerStream};

/// Bounds the handshake, not the answer. A total request timeout would kill long
/// generations mid-flight; the read timeout still caps a stalled stream, because
/// `reqwest` applies it per read rather than to the whole response.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const READ_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Serialize)]
struct AskRequest<'a> {
    question: &'a str,
    history: &'a [HistoryTurn],
    stream: bool,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum AgentFrame {
    Token {
        #[serde(default)]
        text: String,
    },
    Done {
        #[serde(default)]
        answer: Option<String>,
        #[serde(default)]
        citations: Vec<Citation>,
    },
    #[serde(other)]
    Ignored,
}

pub struct AgentService {
    client: reqwest::Client,
    base_url: String,
}

impl AgentService {
    pub fn new(base_url: String) -> Self {
        AgentService {
            client: reqwest::Client::builder()
                .connect_timeout(CONNECT_TIMEOUT)
                .read_timeout(READ_TIMEOUT)
                .build()
                .expect("the default TLS backend is available"),
            base_url,
        }
    }
}

#[async_trait]
impl AgentClient for AgentService {
    async fn ask(
        &self,
        question: &str,
        history: &[HistoryTurn],
        claims_header: &str,
    ) -> Result<AnswerStream, DomainError> {
        let response = self
            .client
            .post(format!("{}/ask", self.base_url))
            .header(CLAIMS_HEADER, claims_header)
            .json(&AskRequest {
                question,
                history,
                stream: true,
            })
            .send()
            .await
            .map_err(|_| DomainError::BadGateway("Could not reach agent".to_string()))?;

        if !response.status().is_success() {
            return Err(DomainError::BadGateway(format!(
                "agent returned {}",
                response.status().as_u16()
            )));
        }

        Ok(Box::pin(frames(response.bytes_stream())))
    }
}

struct SseReader {
    bytes: Pin<Box<dyn Stream<Item = reqwest::Result<Bytes>> + Send>>,
    buffer: Vec<u8>,
    pending: VecDeque<anyhow::Result<AgentEvent>>,
    exhausted: bool,
}

fn frames(
    bytes: impl Stream<Item = reqwest::Result<Bytes>> + Send + 'static,
) -> impl Stream<Item = anyhow::Result<AgentEvent>> + Send {
    futures::stream::unfold(
        SseReader {
            bytes: Box::pin(bytes),
            buffer: Vec::new(),
            pending: VecDeque::new(),
            exhausted: false,
        },
        SseReader::step,
    )
}

/// Splits on the blank line that terminates an SSE event and keeps the remainder
/// buffered — a frame is routinely delivered across two TCP reads, and a multi-byte
/// character can straddle the split, so the buffer stays bytes until a whole frame
/// is in hand.
fn take_frames(buffer: &mut Vec<u8>) -> Vec<Vec<u8>> {
    let mut frames = Vec::new();
    while let Some(end) = buffer
        .windows(2)
        .position(|w| w == b"\n\n")
        .map(|start| start + 2)
    {
        frames.push(buffer.drain(..end).collect());
    }
    frames
}

fn parse_frame(raw: &[u8]) -> Option<anyhow::Result<AgentEvent>> {
    let text = String::from_utf8_lossy(raw);
    let payload: String = text
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(|value| value.strip_prefix(' ').unwrap_or(value))
        .collect::<Vec<_>>()
        .join("\n");

    if payload.trim().is_empty() {
        return None;
    }

    match serde_json::from_str::<AgentFrame>(&payload) {
        Ok(AgentFrame::Token { text }) => Some(Ok(AgentEvent::Token(text))),
        Ok(AgentFrame::Done { answer, citations }) => {
            Some(Ok(AgentEvent::Done { answer, citations }))
        }
        Ok(AgentFrame::Ignored) => None,
        Err(e) => Some(Err(anyhow::anyhow!("unreadable agent frame: {e}"))),
    }
}

impl SseReader {
    async fn step(mut self) -> Option<(anyhow::Result<AgentEvent>, Self)> {
        loop {
            if let Some(event) = self.pending.pop_front() {
                return Some((event, self));
            }
            if self.exhausted {
                return None;
            }

            match self.bytes.next().await {
                Some(Ok(chunk)) => {
                    self.buffer.extend_from_slice(&chunk);
                    for frame in take_frames(&mut self.buffer) {
                        self.pending.extend(parse_frame(&frame));
                    }
                }
                Some(Err(e)) => {
                    self.exhausted = true;
                    self.pending.push_back(Err(anyhow::Error::new(e)));
                }
                // A stream that stops without its terminal frame leaves nothing
                // buffered worth salvaging; the service reads the absence of a
                // `done` event as an invalid response.
                None => self.exhausted = true,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn events<S: Into<String>>(chunks: Vec<S>) -> Vec<anyhow::Result<AgentEvent>> {
        let owned: Vec<Bytes> = chunks.into_iter().map(|c| Bytes::from(c.into())).collect();
        futures::executor::block_on(
            frames(futures::stream::iter(owned.into_iter().map(Ok))).collect::<Vec<_>>(),
        )
    }

    const FIXTURE: &str = include_str!("../../../../../schemas/fixtures/agent-stream.json");

    fn fixture() -> serde_json::Value {
        serde_json::from_str(FIXTURE).expect("the agent-stream fixture parses")
    }

    /// One SSE frame per body, the way agent's `sse()` writes them.
    fn wire(frame: &serde_json::Value) -> String {
        format!("data: {}\n\n", serde_json::to_string(frame).unwrap())
    }

    // Agent builds these frames from Python dataclass `__dict__` dumps and this file parses
    // them by hand. Reading the fixture rather than a literal is the point: a literal here
    // keeps passing after agent renames a field.
    #[test]
    fn every_stream_the_fixture_pins_decodes_to_what_agent_meant() {
        for case in fixture()["cases"].as_array().unwrap() {
            let frames = case["frames"].as_array().unwrap();
            let read = events(frames.iter().map(wire).collect());
            let name = &case["name"];

            let expected_tokens: Vec<&str> = frames
                .iter()
                .filter(|f| f["type"] == "token")
                .map(|f| f["text"].as_str().unwrap())
                .collect();
            let read_tokens: Vec<&str> = read
                .iter()
                .filter_map(|e| match e {
                    Ok(AgentEvent::Token(t)) => Some(t.as_str()),
                    _ => None,
                })
                .collect();
            assert_eq!(read_tokens, expected_tokens, "{name}");

            let terminal = frames.iter().find(|f| f["type"] == "done").unwrap();
            let Some(Ok(AgentEvent::Done { answer, citations })) = read.last() else {
                panic!("{name}: the stream lost its terminal frame");
            };
            assert_eq!(answer.as_deref(), terminal["answer"].as_str(), "{name}");

            let pinned = terminal["citations"].as_array().unwrap();
            assert_eq!(citations.len(), pinned.len(), "{name}");
            for (got, want) in citations.iter().zip(pinned) {
                assert_eq!(got.chunk_id, want["chunk_id"].as_str().unwrap(), "{name}");
                assert_eq!(
                    got.document_id,
                    want["document_id"].as_str().unwrap(),
                    "{name}"
                );
                assert_eq!(got.source, want["source"].as_str().unwrap(), "{name}");
                assert_eq!(got.section_path.as_deref(), want["section_path"].as_str());
            }
        }
    }

    // The leniency is deliberate: agent may add a frame kind, or be too old to send
    // `answer`, without a lockstep release. Each tolerated frame must degrade, never error.
    #[test]
    fn every_frame_the_fixture_tolerates_is_survived() {
        for case in fixture()["tolerated"].as_array().unwrap() {
            let frame = &case["frame"];
            let read = events(vec![wire(frame)]);
            let name = &case["name"];

            assert!(read.iter().all(|e| e.is_ok()), "{name}: {}", case["reason"]);

            if frame["type"] == "done" {
                let Some(Ok(AgentEvent::Done { answer, .. })) = read.first() else {
                    panic!("{name}: a terminal frame must still terminate the stream");
                };
                assert_eq!(answer.as_deref(), frame["answer"].as_str(), "{name}");
            } else {
                assert!(read.is_empty(), "{name}: an unknown frame yields no event");
            }
        }
    }

    #[test]
    fn a_frame_split_across_two_reads_is_reassembled() {
        let read = events(vec![
            "data: {\"type\":\"tok",
            "en\",\"text\":\"split\"}\n\n",
        ]);

        assert_eq!(read.len(), 1);
        assert!(matches!(&read[0], Ok(AgentEvent::Token(t)) if t == "split"));
    }

    #[test]
    fn a_multi_byte_character_straddling_a_read_survives() {
        let payload = "data: {\"type\":\"token\",\"text\":\"caffè\"}\n\n";
        let bytes = payload.as_bytes();
        let split = payload.find('è').expect("the accent is present") + 1;

        let halves = vec![
            Ok(Bytes::copy_from_slice(&bytes[..split])),
            Ok(Bytes::copy_from_slice(&bytes[split..])),
        ];
        let read =
            futures::executor::block_on(frames(futures::stream::iter(halves)).collect::<Vec<_>>());

        assert_eq!(read.len(), 1);
        assert!(matches!(&read[0], Ok(AgentEvent::Token(t)) if t == "caffè"));
    }

    #[test]
    fn several_frames_arriving_in_one_read_are_all_delivered() {
        let read = events(vec![
            "data: {\"type\":\"token\",\"text\":\"a\"}\n\ndata: {\"type\":\"token\",\"text\":\"b\"}\n\n",
        ]);
        assert_eq!(read.len(), 2);
    }

    #[test]
    fn keepalive_comments_and_blank_frames_are_skipped() {
        let read = events(vec![
            ": keepalive\n\n",
            "\n\n",
            "data: {\"type\":\"done\",\"citations\":[]}\n\n",
        ]);
        assert_eq!(read.len(), 1);
    }

    #[test]
    fn an_unparseable_frame_surfaces_as_a_stream_error() {
        let read = events(vec!["data: not json\n\n"]);
        assert_eq!(read.len(), 1);
        assert!(read[0].is_err());
    }

    #[test]
    fn a_stream_that_stops_early_yields_no_terminal_frame() {
        let read = events(vec!["data: {\"type\":\"token\",\"text\":\"partial\"}\n\n"]);
        assert_eq!(read.len(), 1);
        assert!(matches!(&read[0], Ok(AgentEvent::Token(_))));
    }
}
