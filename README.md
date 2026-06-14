<div align="center">
  <img src="documentation/logo.png" alt="CrowdVision Logo" width="2816" />
</div>

CrowdVision is an advanced digital twin and facility management platform designed to provide real-time insights into building occupancy, environmental conditions, and spatial utilization. 

## 🎯 Our Goal

The primary goal of CrowdVision is to bridge the gap between physical spaces and digital monitoring. By leveraging interactive 3D models and real-time data streams, CrowdVision empowers administrators, staff, and users to:
* **Visualize** buildings, floors, and rooms through dynamic 3D digital twins.
* **Monitor** real-time metrics such as room capacity, active occupancy (crowd density), and temperature.
* **Manage** access securely across multiple business domains and subdomains using robust role-based authentication and SSO (OIDC).
* **Stay Informed** through real-time push notifications and an integrated AI assistant.

---

## 📘 Documentation & Developer Guide

**All development instructions, setup guides, and architectural details are hosted on our official documentation site.**

Whether you are a user learning how to navigate the dashboard, or a developer looking to spin up the local environment, generate VAPID keys, or trigger semantic releases, please visit our GitHub Pages website:

👉 **[CrowdVision Official Documentation](https://nickghignatti.github.io/crowd-vision/)**

---

## 🚀 Quick Start

CrowdVision is a polyglot monorepo (JavaScript, Python, Rust) orchestrated by [`just`](https://just.systems/). There is no root `package.json` — each service manages its own dependencies; shared JS dev tooling lives in `tooling/`.

```bash
just install    # install all dependencies (npm per-service + Python uv + Rust cargo)
just env        # generate .env (prompts for secrets, skips existing values)
just dev        # start the full dev stack with hot-reload
```

See the [Developer Setup Guide](documentation/developer/config/setting-up.qd) for full instructions.

## 🔑 AI Agent API Keys

The agent-service uses one OpenAI-compatible provider for chat, tool calling, and
embeddings. OpenRouter is the default:

```env
OPENROUTER_API_KEY=<your-key>
LLM_BASE_URL=https://openrouter.ai/api/v1
ANSWER_MODEL=openai/gpt-4o-mini
EMBEDDING_MODEL=openai/text-embedding-3-small
```

`LLM_API_KEY`, `DEEPSEEK_API_KEY`, and `GOOGLE_API_KEY` remain accepted as legacy aliases,
but the key must belong to the configured endpoint. You can leave the provider key empty if
you do not plan to use the agent; the service boots, but model and embedding requests fail.

For the full reference, see the [Agent Service Guide](documentation/developer/services/agent.qd).

---

## 📄 License

Copyright © 2026 the CrowdVision project owner. All rights reserved.

CrowdVision is **source-available, not open source**. This repository is public so
you can read and evaluate the code. GitHub's Terms of Service let you view and fork
it on GitHub — but any fork stays under this license, and running it, building a
product from it, redistributing it outside GitHub, or using it commercially isn't
permitted.

See the full [LICENSE](LICENSE) for the details. For commercial use or any
permission not covered there, just reach out: **nick.ghignatti@gmail.com**.
