# Chat Service

The conversation layer in front of the agent. It persists multi-turn chats per user in
MongoDB and orchestrates calls to the stateless `agent` `/ask`, forwarding the
caller's mesh-verified `x-gateway-claims` identity header so the agent answers under the
user's identity.

Answers are streamed back to the browser as Server-Sent Events, so tokens render as they
are generated instead of arriving in one block when generation finishes.

The service is exposed through the gateway at `http://localhost/chat`; inside Docker it
listens at `http://chat:3000`.

## Quick Start

From the repository root:

```bash
just stack dev                     # start the full stack (chat + chat-db + agent)
just stack logs chat       # follow chat logs
curl http://localhost/chat/health
```

## Commands

Run from `backend/chat` unless marked **root**.

| Task | Command |
| --- | --- |
| Unit tests + fitness tests (**root**) | `just test chat` |
| Integration tests, throwaway Mongo (**root**) | `just test chat-integration` |
| Unit tests locally | `mise exec -- cargo test --lib` |
| Integration tests against a running Mongo | `MONGO_URI=... mise exec -- cargo test --test api` |
| Lint | `mise exec -- cargo clippy --all-targets -- -D warnings` |
| Format | `mise exec -- cargo fmt` |
| Build | `mise exec -- cargo build --release` |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGO_URI` | `mongodb://localhost:27017/chatdb` | Conversation store |
| `AGENT_URL` | `http://agent:3000` | Where to reach the agent's `/ask` endpoint |
| `HISTORY_MAX_MESSAGES` | `10` | Recent turns sent to the agent as context |
| `PORT` | `3000` | Listen port |

`HISTORY_MAX_MESSAGES` is read once at startup: a non-positive value stops the process
rather than failing the first message with a `500`.

## Documentation

The design — data model, the send-message orchestration, the streaming contract,
claims-header forwarding, and the end-to-end client → chat → agent flow — lives in
the Quarkdown Developer Guide: `documentation/developer/services/chat.qd`.
