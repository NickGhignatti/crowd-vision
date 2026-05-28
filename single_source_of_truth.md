# Crowd-Vision Agent — Single Source of Truth

A from-zero walkthrough of `server/agent-service/`. Read top-to-bottom: every concept (Python, Docker, networking, agents, RAG) is explained the first time it appears. Code references use repo-relative paths.

---

## 1. The 30-second mental model

The agent-service is a **chatbot for the Crowd-Vision platform**. A user sends a question. The service answers using two sources of truth:

1. **Documentation** — markdown files describing the platform, pre-loaded into a Postgres database as searchable text + vector embeddings. This is the "RAG" half (Retrieval-Augmented Generation).
2. **Live data** — current building/room state, fetched on demand by HTTP-calling the `twin-service`.

The "agent" part is this: instead of you choosing which source to query, an LLM (Google's Gemini) decides at runtime by **calling tools** like a function-calling API. The LLM emits something like *"call `search_docs(query="how does occupancy work")`"*; our code runs that function, hands the result back to the LLM, and the LLM either calls another tool or writes the final answer.

That decide → call → observe → decide loop is the entire agent. Everything else in the codebase is plumbing for it.

---

## 2. The container layout (Docker, networks, Caddy)

Crowd-Vision runs as ~7 Docker containers wired together by **Docker Compose**.

### Concepts

- **Docker container** — an isolated process with its own filesystem and network interface. From inside the container it looks like a tiny Linux box.
- **Docker image** — the read-only template a container is launched from. Built from a `Dockerfile`.
- **Docker Compose** — a tool that reads `docker-compose*.yml` files and starts a set of related containers together. `npm run dev` invokes it.
- **Docker network** — a virtual LAN that containers attach to. Containers on the same network can resolve each other by **service name** as a hostname (e.g. `http://twin-service:3000`). Containers on different networks cannot reach each other.
- **Reverse proxy** — a single public entrypoint that forwards incoming requests to internal services based on URL path. Crowd-Vision uses **Caddy** for this.

### How agent-service fits

From [docker-compose.services.yml](docker-compose.services.yml) and [docker-compose.dbs.yml](docker-compose.dbs.yml):

```
                    ┌──────────┐
   browser ────────▶│  Caddy   │  (port 80, public)
                    └────┬─────┘
                         │  /agent/*  →  agent-service:3000
                         ▼
                  ┌──────────────┐
                  │ agent-service│  Python / FastAPI
                  └──┬────────┬──┘
        agent-net │  │        │  gateway-net
                  ▼  │        ▼
            ┌────────┴───┐  ┌──────────────┐
            │  agent-db  │  │ twin-service │
            │ (pgvector) │  │  (Express)   │
            └────────────┘  └──────────────┘
```

- `agent-service` joins **two** networks:
  - `agent-net` — private, only `agent-service` and its database `agent-db` are on it. Nobody else can touch the DB.
  - `gateway-net` — shared, lets Caddy route traffic in and lets the agent reach `twin-service` and `sensor-service`.
- The browser never talks to `agent-service` directly. It talks to Caddy at `/agent/...`, and [Caddyfile](Caddyfile) `handle_path /agent/* { reverse_proxy agent-service:3000 }` strips the prefix and forwards.
- The database is **`pgvector/pgvector:pg17`** — Postgres 17 with the `pgvector` extension that adds a `vector` column type and similarity operators. Same Postgres you know, plus vector search.

### The Dockerfile

[server/agent-service/Dockerfile](server/agent-service/Dockerfile) is a **multi-stage build**:

1. **builder stage** — installs `uv` (fast Python package manager), reads `pyproject.toml`, installs all deps system-wide.
2. **production stage** — copies just the installed packages and the app source into a clean `python:3.12-slim` image. Result: a smaller final image with no build tooling.

The container runs `uvicorn app.main:app --host 0.0.0.0 --port 3000`. **uvicorn** is the ASGI server (the Python equivalent of Node's `http.createServer`); it loads the FastAPI `app` object from `app/main.py` and listens on port 3000.

---

## 3. Python concepts you'll see everywhere

Quick glossary. Skip if you know Python.

- **`async def` / `await`** — declares an asynchronous function. It returns a *coroutine*; nothing actually runs until you `await` it. The event loop can run other tasks while one is waiting on I/O. Same shape as JavaScript's `async`/`await`.
- **`from __future__ import annotations`** — makes every type annotation lazy (treated as a string), so you can reference types you haven't imported yet at runtime. Lets us avoid circular imports.
- **`if TYPE_CHECKING:`** — a constant that's `True` only for type checkers (mypy/pyright), `False` at runtime. Imports inside it are free at runtime — used to break import cycles when you only need a type for annotations.
- **`@dataclass`** — decorator that auto-generates `__init__`, `__repr__`, `__eq__` from class-level annotations. A lightweight struct.
- **`Protocol`** — a **structural** interface (PEP 544). Any class with the right method shape satisfies it; no inheritance needed. Used here for `Reranker`, `Embedder`, `LLMClient`, `Tool`. Lets you swap implementations without a base class.
- **Pydantic `BaseModel`** — a class that validates/parses/serializes data from type hints. We use it for **request bodies**, **tool arguments**, and **settings**. `model.model_dump()` → dict, `Model.model_validate(d)` → instance, `Model.model_json_schema()` → JSON Schema (which is what we feed to Gemini's tool-calling API).
- **`Field(...)`** — Pydantic helper that attaches metadata (defaults, validation, descriptions) to a model field. Descriptions show up in the JSON Schema the LLM sees.
- **FastAPI `Depends(...)`** — declares that a parameter is provided by another function (a "dependency"). FastAPI calls the dependency, injects its return value. Used here to inject the DB session and the authenticated user into routes.
- **`@asynccontextmanager` + `lifespan`** — a function that runs once at startup (`yield` is the boundary) and once at shutdown. We use it to configure logging, open the DB engine, and dispose it cleanly.
- **`@lru_cache`** — caches a function's return based on its args. We use it on `get_settings()` so `Settings()` is parsed from env vars **once**.

---

## 4. The boot sequence

When the container starts and uvicorn imports `app.main`:

1. [app/main.py](server/agent-service/app/main.py) creates the `FastAPI` app object with metadata (title, version, OpenAPI tags).
2. The `lifespan(app)` async context manager runs:
   - `configure_logging()` — structured JSON logs.
   - `configure_tracing()` — OpenTelemetry. If `OTEL_EXPORTER_OTLP_ENDPOINT` is set, spans (timing data) get pushed to a collector. Otherwise it's a no-op.
   - `get_settings()` — parses env vars into a `Settings` object via Pydantic. See [app/config.py](server/agent-service/app/config.py).
   - `get_engine()` — opens the SQLAlchemy async engine to Postgres. SQLAlchemy is Python's de-facto ORM; we use only its **Core** + raw SQL here, no ORM models. See [app/db.py](server/agent-service/app/db.py).
3. CORS middleware is added so the Vite dev server (`localhost:5173`) and Caddy (`localhost:80`) can call the API.
4. `FastAPIInstrumentor.instrument_app(app)` wraps every route with auto-tracing.
5. Three routers are mounted:
   - `/health` — public liveness check.
   - `/ingest` — admin-only; add a doc to the knowledge base.
   - `/ask` — the actual chatbot endpoint.

Then uvicorn starts listening on port 3000.

---

## 5. Phase A — Ingestion (offline: filling the knowledge base)

**Goal:** turn a markdown document into searchable rows in Postgres. This runs once per doc, before any user asks anything.

Endpoint: `POST /ingest` → [app/routes/ingest.py](server/agent-service/app/routes/ingest.py). Handler delegates to [app/services/ingest.py](server/agent-service/app/services/ingest.py) → `ingest_document()`.

### Step-by-step

Given a markdown body and a `source` identifier (e.g. `"docs/getting-started.md"`):

#### 5.1 Deduplicate by content hash

```python
content_hash = sha256(content)
SELECT id FROM documents WHERE content_hash = :h
```

If found, return `(id, 0, skipped=True)`. Re-ingesting the same file is a free no-op — embeddings are expensive, this avoids paying twice.

#### 5.2 Chunking

[app/chunking/markdown.py](server/agent-service/app/chunking/markdown.py) — `chunk_markdown(text)`.

**Why chunk?** LLMs and embedding models have token limits. You can't embed a 50-page document as one vector — the meaning gets averaged into mush. You split into ~400-token pieces so each piece is about one specific topic.

**How:** parse the markdown with `markdown-it-py`, walk the token stream, and:

- **Headings** → a chunk on their own; we maintain a `heading_stack` so each chunk knows its `section_path` like `"Getting started > Installation > Docker"`.
- **Code fences** → kept as **atomic chunks** (never split mid-code).
- **Tables** → atomic chunks too.
- **Paragraphs / lists** → if over `max_tokens=400`, split on paragraph then sentence boundaries with `overlap=50` tokens between consecutive chunks (so context near the boundary survives).

Token counting uses `tiktoken` (OpenAI's tokenizer, `cl100k_base`) — it's a reasonable approximation for Gemini too.

Each output `Chunk` has: `content`, `kind` (`heading`/`code`/`table`/`text`), `section_path`, `token_count`, `metadata`.

#### 5.3 Embedding

```python
vectors = await embedder.embed([c.content for c in chunks])
```

[app/embeddings/gemini.py](server/agent-service/app/embeddings/gemini.py) calls Gemini's `embed_content` for each chunk in parallel via `asyncio.gather`.

**Embedding** = run a chunk of text through a model that returns a fixed-length vector of floats (here 768 dimensions). Two texts with similar meaning produce vectors that point in similar directions. "Similarity" is then just a math operation on vectors (cosine similarity).

We pass `task_type="RETRIEVAL_DOCUMENT"` for documents and `RETRIEVAL_QUERY` for queries — Gemini tunes the vectors slightly differently for each side of the search.

#### 5.4 Insert into Postgres

```sql
INSERT INTO documents (source, content_hash, metadata, permissions) ...
INSERT INTO chunks (document_id, section_path, kind, content, token_count,
                    embedding, permissions, metadata) ...
```

Two tables:
- `documents` — one row per ingested file.
- `chunks` — many rows per document. Has an `embedding vector(768)` column (pgvector type) and a `tsv tsvector` column (Postgres full-text search type, populated by a generated column or trigger via Alembic migration).

**`permissions`** is a JSONB array of strings like `["domain:acme", "role:admin"]`. Empty = visible to any authenticated user. This is the access-control mechanism applied at retrieval time.

After both tables are populated, `await session.commit()` finalizes the transaction.

---

## 6. Phase B — Answering a question (the agent loop)

**Goal:** user sends `"How many people are in HQ right now?"`; we return an answer with citations.

Entry: `POST /ask` → [app/routes/ask.py](server/agent-service/app/routes/ask.py).

### 6.1 Auth + DB session

Two FastAPI dependencies fire before our handler runs:

- `get_session` ([app/db.py](server/agent-service/app/db.py)) — opens a SQLAlchemy `AsyncSession` from a session factory. The `async with` ensures it's closed even on error.
- `require_user` ([app/auth.py](server/agent-service/app/auth.py)) — pulls the JWT from the `authentication_token` cookie (or `Authorization: Bearer ...` header), verifies it with `JWT_SECRET` using HS256, and returns an `AuthUser(user_id, roles, domains)`. The token was issued by the separate `auth-service`; we trust it because we share the secret.

**JWT** = JSON Web Token. A signed JSON blob: `header.payload.signature`. The signature lets us verify the payload wasn't tampered with, without calling auth-service on every request. Stateless auth.

### 6.2 The handler dispatches to the agent

```python
agent = Agent()  # constructed once at module load
result = await agent.answer(session, question, user, history=history)
```

Or if `stream=true`, returns a `StreamingResponse` that emits Server-Sent Events.

**SSE (Server-Sent Events)** = a long-lived HTTP response where the server writes `data: {...}\n\n` lines as they become available. The browser reads them with `EventSource`. Simpler than WebSockets when only the server pushes.

### 6.3 The agent loop — [app/agent/loop.py](server/agent-service/app/agent/loop.py)

This is the heart of the system. Let me walk it line by line.

#### 6.3.1 Bootstrap the message list

```python
messages = [
    {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + scope},
    *history,                       # prior turns from the conversation
    {"role": "user", "content": question},
]
```

The **system prompt** ([app/agent/prompts.py](server/agent-service/app/agent/prompts.py)) tells the model what tools exist and when to use them. Critically, it ends with: *"If after using tools you still cannot answer, reply EXACTLY: I don't know based on the available data."* — that exact string is the **IDK marker** we detect to flag low-confidence answers.

**Scope** injects the caller's domains/roles so the LLM knows which `domain` argument to pass to tools when the user says "show me my buildings".

#### 6.3.2 Get the tool schemas

```python
tools = REGISTRY.schemas()
```

[app/agent/tools/registry.py](server/agent-service/app/agent/tools/registry.py) — `ToolRegistry` is a dict of `name → tool instance`. `schemas()` walks every registered tool, takes its Pydantic `Args` model, calls `.model_json_schema()`, strips Gemini-incompatible keys, and returns a list of `ToolSchema`.

The registry is populated as a side effect of importing [app/agent/tools/__init__.py](server/agent-service/app/agent/tools/__init__.py):

```python
REGISTRY.register(SearchDocsTool())
REGISTRY.register(ListBuildingsTool())
REGISTRY.register(GetBuildingTool())
REGISTRY.register(ListRoomsTool())
REGISTRY.register(GetRoomTool())
REGISTRY.register(GetOccupancyHistoryTool())
```

Each tool is a small class with three things:
- `name: str` — what the LLM sees.
- `description: str` — natural-language hint that tells the LLM **when** to use it.
- `Args: type[BaseModel]` — Pydantic model defining the arguments schema.
- `async def run(self, args, ctx) -> ToolResult` — the implementation.

This is identical to the **OpenAI / Anthropic function-calling pattern**: hand the model a list of `{name, description, parameters_json_schema}` and it can choose to emit a "function call" part instead of text.

#### 6.3.3 The hop loop

```python
for hop in range(self._settings.max_tool_hops):  # default 6
    turn = await self._llm.chat(messages, tools=tools)
    ...
```

A **hop** = one round-trip with the LLM. Each iteration:

1. **Call the LLM with the current message history + tool schemas.**
   [app/agent/llm/gemini.py](server/agent-service/app/agent/llm/gemini.py) → `GeminiClient.chat()`:
   - Splits out `system` messages (Gemini takes them via a separate `system_instruction` field).
   - Translates our internal message dicts into Gemini's `Content` / `Part` types. A `tool` message becomes a `function_response` part; an `assistant` message with `tool_calls` becomes `function_call` parts.
   - Calls `client.models.generate_content(...)`. This blocks (the SDK is synchronous), so we wrap it in `asyncio.to_thread(...)` + `asyncio.wait_for(timeout=30s)` to make it async-friendly and bounded.
   - Parses the response: text parts → `text`, function-call parts → `ToolCall` objects.
   - Computes USD cost from token counts via [app/agent/llm/pricing.py](server/agent-service/app/agent/llm/pricing.py).

2. **Check the response.** Returns a `ChatTurn(text, tool_calls, usage)`.

3. **Branch on `tool_calls`:**

   - **Empty list** → the model is done; `turn.text` is the final answer. Run citation extraction (next section), return `AnswerResult`. Loop exits.
   - **Non-empty** → execute the tools, then append both the assistant's request and the tool results to `messages` and loop again.

4. **Append the assistant turn:**
   ```python
   messages.append({
       "role": "assistant",
       "content": turn.text,
       "tool_calls": [{"id": c.id, "name": c.name, "arguments": c.arguments} for c in turn.tool_calls],
   })
   ```

5. **Run each tool** via `_run_tool_calls(...)`:
   - Look up the tool in the registry.
   - Validate the LLM-supplied arguments against the tool's `Args` Pydantic model (catches bad/missing fields early).
   - Wrap in an OpenTelemetry span.
   - Call `tool.run(args, ctx)` — `ctx` is a `ToolContext(user, session, citations)` shared across all tools in this answer.
   - Append a `tool` message: `{"role": "tool", "tool_call_id": id, "name": name, "content": json.dumps(result.content)}`.
   - On exception, the result content is `"tool X failed: ..."` and `is_error=True` — the LLM sees the error and can recover by calling another tool.

6. **Loop back.** The new `messages` list now includes the tool results, so when we call the LLM again, it sees them and decides next: another tool, or write the final answer.

If we exit the `for` without a final answer (model kept calling tools), we return `IDK_MARKER` with `decision="tool_loop_exhausted"`. The hop limit (6) is the safety brake against infinite loops.

### 6.4 The tools

#### `search_docs` — [app/agent/tools/search_docs.py](server/agent-service/app/agent/tools/search_docs.py)

The RAG tool. Args: `query: str, top_k: int = 5`.

Calls `HybridRetriever.retrieve(...)` — the most important piece of code in the codebase. See section 7.

Returns a `ToolResult` whose `content` is `{"chunks": [{chunk_id, source, section, score, content}, ...]}` and whose `citations` field carries the raw `RetrievedChunk` objects so the agent loop can validate `[^chunk_id]` markers later.

#### `list_buildings`, `get_building`, `list_rooms`, `get_room` — [app/agent/tools/twin.py](server/agent-service/app/agent/tools/twin.py)

Live-state tools. Each one uses `httpx.AsyncClient` to make an HTTP call to `twin-service` over the `gateway-net` Docker network. Examples:

```python
async with httpx.AsyncClient(base_url="http://twin-service:3000") as c:
    r = await c.get(f"/buildings/{args.domain}")
```

`twin-service:3000` resolves via Docker DNS — that's why we don't need IPs. The response JSON is **slimmed down** before returning to the LLM (drop fields it doesn't need; less context = cheaper + better focus).

Authorization here is implicit: the caller's permissions were already checked by `require_user`, and the system prompt tells the LLM to scope queries to the caller's own domain.

### 6.5 Citation handling

After the loop produces a final answer, [app/citations.py](server/agent-service/app/citations.py) runs:

```python
valid, hallucinated = extract_citations(answer_text, retrieved_chunks)
cleaned = strip_hallucinated(answer_text, hallucinated)
```

The system prompt asks the model to write `[^chunk_id]` markers when citing docs. We:
1. Regex-find all `[^...]` markers.
2. Match each id against chunks the agent actually retrieved (`ctx.citations`).
3. Real ones → returned in the `citations` array.
4. Made-up ones (the model invented a UUID) → stripped from the answer **and** reported in `hallucinated_citations` for diagnostics.

This is the "trust but verify" layer. The model can hallucinate text, but it can't hallucinate a chunk_id that resolves.

### 6.6 The response

```json
{
  "answer": "HQ has 42 rooms; the busiest is Atrium with 18/30 occupied [^abc123].",
  "citations": [{"chunk_id": "abc123", "document_id": "...", "source": "...", "section_path": "..."}],
  "usage": {"input_tokens": 1842, "output_tokens": 56, "cost_usd": 0.00031},
  "retrieval": {"tool_calls": [{"name": "list_rooms", "args": {...}}], "hallucinated_citations": []},
  "idk": false,
  "decision": "answered"
}
```

---

## 7. The retrieval pipeline (zoomed in)

[app/retrieval/pipeline.py](server/agent-service/app/retrieval/pipeline.py) — `HybridRetriever.retrieve()`.

This is what makes `search_docs` work. Five stages.

### 7.1 Embed the query

```python
query_vec = await self._embedder.embed_query(question)  # 768 floats
```

### 7.2 Vector search

[app/retrieval/vector.py](server/agent-service/app/retrieval/vector.py) — pgvector cosine similarity.

```sql
SELECT ..., 1 - (c.embedding <=> CAST(:vec AS vector)) AS score
FROM chunks c
WHERE jsonb_array_length(c.permissions) = 0
   OR c.permissions ?| CAST(:perms AS text[])
ORDER BY c.embedding <=> CAST(:vec AS vector)
LIMIT 20
```

- `<=>` is pgvector's **cosine distance** operator (0 = identical direction). `1 - distance` = similarity. We `ORDER BY` distance ascending = most similar first.
- The permission filter: if a chunk's permissions list is empty (public) **or** the user has at least one matching permission (`?|` is JSONB "any of these keys exist"), the chunk is visible.
- Returns top 20 (`top_k_vector` setting).

### 7.3 Keyword search

[app/retrieval/keyword.py](server/agent-service/app/retrieval/keyword.py) — Postgres full-text search.

```sql
SELECT ..., ts_rank(c.tsv, websearch_to_tsquery('english', :q)) AS score
FROM chunks c
WHERE c.tsv @@ websearch_to_tsquery('english', :q)
  AND (jsonb_array_length(c.permissions) = 0
       OR c.permissions ?| CAST(:perms AS text[]))
ORDER BY score DESC
LIMIT 20
```

- `tsv` is a precomputed `tsvector` column (set up by Alembic migration).
- `websearch_to_tsquery` parses Google-style queries (`"exact phrase" -excluded`).
- `@@` = matches operator. `ts_rank` scores the match.

**Why both vector AND keyword?** They fail in opposite ways. Vector search nails *meaning* but misses rare exact tokens (think: a unique error code). Keyword search nails *exact tokens* but misses paraphrases. **Hybrid retrieval = take the union and merge ranks.**

### 7.4 RRF merge

```python
def _rrf_merge(vec_hits, kw_hits, k=60):
    scores = {}
    for ranked_list in (vec_hits, kw_hits):
        for rank, hit in enumerate(ranked_list):
            scores[hit.id] += 1.0 / (k + rank + 1)
    return sorted(..., key=scores, reverse=True)
```

**RRF (Reciprocal Rank Fusion).** A chunk's final score is the sum of `1/(60 + its_rank)` across each ranked list it appears in. The `k=60` constant smooths things out so being rank #1 in one list doesn't completely overwhelm being rank #5 in another. Industry default; doesn't need normalized scores between the two systems. That's its whole appeal — vector scores (cosine) and ts_rank scores live on incomparable scales, but ranks are universal.

### 7.5 Reranking

```python
reranked = await self._reranker.rerank(question, merged)
return reranked[:6]
```

[app/retrieval/reranker/base.py](server/agent-service/app/retrieval/reranker/base.py) declares the `Reranker` Protocol; [app/retrieval/reranker/noop.py](server/agent-service/app/retrieval/reranker/noop.py) is the current implementation — returns candidates unchanged. The slot exists so a real cross-encoder reranker (e.g. Cohere Rerank) can be plugged in later by changing the `RERANKER` env var, without touching the pipeline.

**Reranker concept.** Embedding-based search is fast (one matrix lookup) but coarse. A cross-encoder reranker takes (query, chunk) pairs and computes a more expensive similarity score for each — too slow to run on millions of chunks, fine on the top 40. Two-stage retrieval: cheap recall, then expensive precision.

Top 6 chunks (`top_k_final`) are returned to `search_docs`, which hands them to the LLM.

---

## 8. The full request lifecycle in one picture

```
POST /agent/ask  (browser)
  ↓ Caddy strips /agent
POST /ask  (agent-service)
  ↓ Depends(get_session)   → AsyncSession
  ↓ Depends(require_user)  → AuthUser (decoded JWT)
  ↓
Agent.answer(session, question, user, history)
  ├── messages = [system, ...history, user_question]
  ├── tools    = REGISTRY.schemas()  # JSON Schemas for Gemini
  ├── for hop in range(6):
  │     turn = await Gemini.chat(messages, tools)
  │     if not turn.tool_calls: break  # done
  │     append assistant + tool_calls
  │     for call in turn.tool_calls:
  │         args = Tool.Args(**call.arguments)   # Pydantic validates
  │         result = await tool.run(args, ctx)
  │         append tool message
  │         # If tool == search_docs:
  │         #   embed query → pgvector + tsv search → RRF → rerank → top 6
  │         # If tool == list_buildings (etc):
  │         #   httpx GET twin-service:3000/buildings/{domain}
  ├── extract_citations(answer, retrieved_chunks)
  └── return AnswerResult(answer, citations, usage, ...)
  ↓
StreamingResponse (SSE)  OR  AskResponse (JSON)
  ↓
browser
```

---

## 9. Settings worth knowing

From [app/config.py](server/agent-service/app/config.py):

| Env var | Default | What it does |
|---|---|---|
| `POSTGRES_URL` | `postgresql+asyncpg://agent:agent@agent-db:5432/agentdb` | Async connection string. `+asyncpg` selects the async driver. |
| `GOOGLE_API_KEY` | `""` | Gemini auth. |
| `JWT_SECRET` | `""` | Shared with `auth-service` for HS256 verification. |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | Embedder model. |
| `EMBEDDING_DIM` | `768` | Must match the `vector(N)` column in the schema. |
| `ANSWER_MODEL` | `gemini-2.5-flash` | LLM for the answer loop. |
| `RERANKER` | `noop` | Set to e.g. `cohere` once a real reranker exists. |
| `TOP_K_VECTOR` / `TOP_K_KEYWORD` / `TOP_K_FINAL` | `20` / `20` / `6` | Funnel sizes. |
| `MAX_TOOL_HOPS` | `6` | Loop safety cap. |
| `LLM_TIMEOUT_SECONDS` | `30` | Per-LLM-call timeout. |
| `TWIN_SERVICE_URL` | `http://twin-service:3000` | Internal hostname for tool HTTP calls. |
| `REQUIRE_AUTH` | `true` | Set to `false` only for local debugging. |

---

## 10. How the pieces talk to each other (cheat sheet)

| Caller | Callee | Mechanism |
|---|---|---|
| Browser | Caddy | HTTP(S) on port 80 |
| Caddy | agent-service | HTTP on `agent-service:3000` (via `gateway-net`) |
| agent-service | agent-db | TCP/Postgres on `agent-db:5432` (via `agent-net`), SQLAlchemy + asyncpg driver |
| agent-service | twin-service | HTTP on `twin-service:3000` (via `gateway-net`), `httpx.AsyncClient` |
| agent-service | Google Gemini | HTTPS to Google's API, `google-genai` SDK wrapped in `asyncio.to_thread` |
| auth-service | (issues JWT) | Sets `authentication_token` cookie; agent-service verifies with shared `JWT_SECRET` |

---

## 11. If you remember only five things

1. **An "agent" is a `while` loop where an LLM picks a tool, you run it, and you feed the result back, until the LLM stops calling tools.** That loop is in [app/agent/loop.py](server/agent-service/app/agent/loop.py). Everything else exists to feed it.

2. **RAG = retrieve relevant text + put it in the prompt.** Retrieval here is *hybrid* (vector ⊕ keyword via RRF) plus a reranker slot, defined in [app/retrieval/pipeline.py](server/agent-service/app/retrieval/pipeline.py).

3. **Tools = Pydantic-described functions.** A tool's `Args` model becomes the JSON Schema the LLM sees; its `run()` is what actually executes. Adding a tool = make a class + register it in [app/agent/tools/__init__.py](server/agent-service/app/agent/tools/__init__.py).

4. **Postgres + pgvector is one database, two indexes:** an HNSW vector index for `embedding`, a GIN index for `tsv`. We query both and merge ranks.

5. **Docker networks isolate the database.** `agent-db` is on `agent-net` only; nothing but `agent-service` can reach it. The agent reaches *out* to `twin-service` via the shared `gateway-net`. Hostnames are service names, not IPs.

---

## 12. Recommended next reading (in this order)

1. Anthropic, *"Building effective agents"* — the cleanest framework-free explanation of the loop pattern.
2. Pinecone Learning Center — chunking, hybrid search, reranking.
3. The pgvector README — `<=>`, `<->`, `<#>` operators and HNSW indexes.
4. The Gemini function-calling docs — the `function_call` / `function_response` part shape that `gemini.py` translates to/from.
5. FastAPI's "Bigger applications" + "Dependencies" pages — to internalize how `Depends` and routers compose.

Once those click, re-read [app/agent/loop.py](server/agent-service/app/agent/loop.py) end to end. It will read like prose.
