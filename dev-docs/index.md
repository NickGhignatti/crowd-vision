# CrowdVision Developer Guide

CrowdVision is a real-time crowd monitoring platform built on a **digital twin** paradigm. It lets administrators observe, in 3D, the live occupancy and environmental state of every room in a building — streamed from IoT sensors.

The repository is a **Lerna monorepo** (MEVN stack) deployed entirely via Docker Compose with a Caddy reverse-proxy gateway.

## Packages

| Package | Description |
|---------|-------------|
| `client` | Vue 3 + TresJS + Tailwind SPA |
| `server/auth-service` | Account auth, JWT, domain management, OIDC/SSO |
| `server/twin-service` | CRUD for buildings and rooms |
| `server/socket-service` | Socket.IO gateway bridging Redis pub/sub → browser |
| `server/notification-service` | Web Push (VAPID) + Redis pub/sub dispatch |
| `server/llm-service` | *(experimental)* Fastify + LangChain AI service |

## Quick start

```bash
npm run dev     # setup + docker compose watch (hot reload + DB GUIs)
npm start       # production-like, detached
npm run stop    # tear down
npm test        # all service tests in parallel
```