# chat

Rust / Axum / MongoDB. Owns conversations and messages; the answer itself comes from
`agent`, which chat drives and relays. Route `/chat/*`, gated at the edge.
Docs: `documentation/architecture/chat-architecture.qd`.

## Layout

Ports & Adapters, enforced by `tests/architecture_fitness.rs` — read it before restructuring.

| Path | Holds |
|---|---|
| `src/domain/` | Conversation, message, citation, `DomainError`. No axum/mongodb/reqwest/bson, no `crate::{service,adapters}`. |
| `src/service/` | Use cases + `ports.rs` traits (`ConversationStore`, `AgentClient`). No framework, no adapters. `fakes.rs` = in-memory doubles for unit tests. |
| `src/adapters/driving/` | HTTP API. Must not reach into `driven`. |
| `src/adapters/driven/` | Mongo persistence, agent client. |

## Invariants

**Answering is SSE, not JSON.** `POST /chat/conversations/{id}/messages` streams frames
`{"type":"token"}` → terminal `{"type":"done"}` or `{"type":"error"}`. Failures *before* the
stream opens stay ordinary status codes. Needs `flush_interval -1` at Caddy, else the proxy
buffers and every token lands at once.

**Persist only on `done`.** Both halves of the exchange are written in one
`append_exchange`, when the terminal frame arrives — an aborted generation leaves nothing
half-written (`an_aborted_stream_persists_neither_message`).

**The agent's `answer` on the terminal frame wins over the concatenated tokens** when
present: agent rewrites what the model produced (stripped hallucinated citations, preamble
streamed before a tool call). It is `Option` because an older agent may not send it.

**No blanket `rename_all = "camelCase"`.** Citation fields are agent's Python payload,
stored and returned as-is; a blanket rename silently rewrites them. Test-enforced.

**`ObjectId` never leaves `adapters/driven/persistence/conversations.rs`.** bson renders it
as `{"$oid": …}`, so ids must be mapped to bare strings in the persistence adapter.
Test-enforced against that exact file.

**The claims header name comes from `claims_schema::CLAIMS_HEADER`**, never a literal
`"x-gateway-claims"` in this crate. Test-enforced.

**Agent client timeouts bound the handshake, not the answer**: `connect 5s`, `read 60s`, no
total timeout — a total timeout would kill a long generation mid-flight, while the read
timeout still caps a stalled stream.

## Tests

```bash
just test chat               # unit, in-module #[cfg(test)]
just test chat-integration   # tests/*.rs against a throwaway Mongo, composed then torn down
```
