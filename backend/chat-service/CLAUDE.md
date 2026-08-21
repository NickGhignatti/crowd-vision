# chat-service

Rust / Axum / MongoDB. Conversation history + streaming proxy to `agent-service`.
No AI here — no LLM, no retrieval. That is all `agent-service`.

## Shape

Ports & Adapters:

- `src/domain/` — pure: conversation model, validation, claims
- `src/service/` — use cases + `Arc<dyn Port>` (`ConversationStore`, `AgentClient`)
- `src/adapters/driving/` — HTTP (SSE)
- `src/adapters/driven/` — Mongo, agent SSE client
- wired in `main.rs`

Test-enforced by `tests/architecture_fitness.rs`; `x-gateway-claims` literal only in
`domain/identity.rs`, `ObjectId` only in the persistence adapter.

## Streaming contract

`POST /conversations/{id}/messages` is **SSE, not JSON**. Frames:

| Frame | Meaning |
|---|---|
| `{"type":"token","text":…}` | one chunk of the answer |
| `{"type":"done","message":…}` | terminal; carries the persisted assistant message |
| `{"type":"error","error":…,"message":…}` | terminal; failure after the response began |

**Errors split by timing.** Everything knowable before generation starts — validation,
404, the message cap, unreachable agent — is an ordinary status code, because the stream
has not opened. After that the status line is gone, so failures are an `error` frame on a
`200`. `DomainError::describe()` names both, so the two read identically.

**Persist only on `done`.** Tokens accumulate in memory; nothing is written until the
terminal frame arrives. A dropped stream leaves no half-written message and no retitled
conversation. A stream that ends without `done` is `"agent-service returned an invalid
response"` — the streaming heir to the old shape check on the buffered body.

Real time-to-first-token also needs `agent-service` to stream its final hop.
`loop.py:stream_answer` currently computes the whole answer, then emits it as one `token`
event. This service is already correct for both.

## Node parity traps

The service was ported from Node/Express; these are the ones that bite.

- **`_id` is a bare string, at both levels.** Mongoose rendered it that way; `bson`
  renders `{"$oid":…}`. Messages carry their own `_id` too — easy to miss on the
  embedded array.
- **Citation fields stay snake_case** (`chunk_id`, `document_id`, `source`,
  `section_path`) — agent-service's Python payload, stored and returned as-is. A blanket
  `rename_all = "camelCase"` breaks every one; a fitness test forbids it.
- **`updatedAt` on every write.** Mongoose maintained it; nothing does now. The
  conversation list sorts by it, so forgetting it stops the list reordering with no error.
- **404, never 403 or 400.** An unparseable ObjectId and another account's conversation
  both return 404, so neither leaks existence. The persistence adapter turns an
  unparseable id into a miss rather than an error.
- **Absent title ≠ null title.** Absent defaults to `"New chat"`; `null` is a validation
  error. `Option<T>` collapses the two, so request bodies stay `serde_json::Value` and
  test key presence.
- **`validate_text` trims first, then measures** the trimmed value.

## Deliberate divergences from the Node service

- `chat_http_error_requests_total` now counts 5xx only, not every 4xx. A 404 is a normal
  outcome here, and `prometheus.rules.yml` alerts on the ratio.
- `HISTORY_MAX_MESSAGES` is validated once at boot (process refuses to start) instead of
  per request (500 on first message).
- The list response drops Mongoose's vestigial `__v`.
- The dead `accountMemberships` claims normalisation is gone; only `sub` was ever read.

## Timeouts

`adapters/driven/agent.rs`: 5s connect, 60s **read** — per-read, not total. A total
timeout would kill a long generation mid-stream; the read timeout still caps a stalled
one. Caddy needs `flush_interval -1` on `/chat/*` or it buffers the whole stream.

## Tests

- `src/` = unit only (`just test chat`)
- `tests/architecture_fitness.rs` = layering, runs with the unit tests
- `tests/api.rs` = integration, real Mongo + wiremock agent (`just test chat-integration`)

A client per test: `#[tokio::test]` drops its runtime afterwards and takes the Mongo
client's monitoring tasks with it, so a shared client fails every test after the first.
