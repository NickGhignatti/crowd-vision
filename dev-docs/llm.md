# LLM Service Architecture

The **LLM Service** is a new microservice introduced in v2.0.0 to decouple AI logic from the core application. It acts as an intelligent layer that processes natural language and generates insights based on system data.

## 🏗️ Technology Stack

We chose a lightweight but robust stack to handle AI requests efficiently:

* **Runtime:** Node.js
* **Framework:** [Fastify](https://www.fastify.io/) (Selected for low overhead and high performance)
* **Orchestration:** [LangChain.js](https://js.langchain.com/)
* **Models:**
    * **DeepSeek (Chat & Reasoner)**: Used for complex logic and cost-effective queries.
    * **Google Gemini (Flash Lite)**: Used for high-speed, multimodal tasks.

## 🧠 Why a Separate Service?

### 1. Isolation of Heavy Dependencies
AI libraries (like LangChain) and SDKs are heavy. By isolating them in a separate container, we keep the `auth-service` and `twin-service` lightweight and fast.

### 2. Independent Scaling
AI inference is computationally expensive and latency-prone compared to simple CRUD operations. This architecture allows us to scale the `llm-service` independently (e.g., adding more replicas) without affecting the real-time performance of the `socket-service`.

### 3. Model Agnosticism
The service uses `LangChain` to abstract the underlying model providers. This allows us to switch between **DeepSeek**, **Gemini**, or **OpenAI** by simply changing environment variables, without rewriting business logic.

## 🔌 API & Integration

The service exposes a REST API via Fastify.

* **Prefix**: `/api`
* **Routes**: Auto-loaded from the `routes/` directory.

### Example Configuration (`.env`)
To run the service, ensure the following API keys are set in your environment:

```bash
DEEPSEEK_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
