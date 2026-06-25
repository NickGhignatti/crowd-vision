# Chat Service

The conversation layer in front of the agent. It persists multi-turn chats per user in
MongoDB and orchestrates calls to the stateless `agent-service` `/ask`, forwarding the
caller's JWT so the agent answers under the user's identity.

The service is exposed through the gateway at `http://localhost/chat`; inside Docker it
listens at `http://chat-service:3000`.

## Quick Start

From the repository root:

```bash
just stack dev                     # start the full stack (chat-service + chat-db + agent-service)
just stack logs chat-service       # follow chat-service logs
curl http://localhost/chat/health
```

## Commands

Run from `server/chat-service` unless marked **root**.

| Task | Command |
| --- | --- |
| Run tests (**root**, via Moon) | `just test chat` |
| Run tests locally | `npm test` |
| Lint / type-check | `npm run lint` |
| Apply lint + formatting fixes | `npm run lint:fix` |
| Build | `npm run build` |
| Run in watch mode | `npm run dev` |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_BASE_URL` | `http://agent-service:3000` | Where to reach the agent's `/ask` endpoint |
| `JWT_SECRET` | — | HS256 secret; must match `auth-service` |
| `JWT_COOKIE_NAME` | `authentication_token` | Cookie the JWT is read from |
| `HISTORY_MAX_MESSAGES` | `10` | Recent turns sent to the agent as context |

## Documentation

The design — data model, the send-message orchestration, cookie forwarding, and the
end-to-end client → chat-service → agent flow — lives in the Quarkdown Developer Guide:
`documentation/developer/services/chat.qd`.
