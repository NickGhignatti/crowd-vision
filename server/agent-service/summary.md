
# Agent-service

## Architecture

### Service

```
                   ┌──────────────────────────────────────┐
   HTTP (Caddy     │            agent-service             │
   /agent/*) ────► │  FastAPI (uvicorn, async)            │
                   │   ├── /health   public               │
                   │   ├── /ingest   admin                │
                   │   └── /ask      JWT cookie required  │
                   │         │                            │
                   │         ▼                            │
                   │       Agent loop ◄──── tool registry │
                   │         │                            │
                   │   ┌─────┴──────┐                     │
                   │   ▼            ▼                     │
                   │  LLM        Tools                    │
                   │(OpenRouter) (search_docs · twin·*)   │
                   └────┬────────────┬────────────────────┘
                        │            │
                        ▼            ▼
            OpenAI-compatible  Postgres 17 (+pgvector,
            API — OpenRouter   +tsvector) — chunks,
            (embeddings, gen)  documents, permissions
                        │            ▲
                        │            │ HTTP
                        │            ▼
                        │      twin-service (Mongo)
                        ▼
                 (alembic upgrade
                  on container start
                  using psycopg)
```

**Environment.** Runs as a docker container on the `gateway-net` and `agent-net` networks. Migrations run at boot via `alembic upgrade head`. Caddy fronts the service at `/agent/*`. A sibling `agent-ingester` one-shot service waits on `/health` and ingests the `documentation/` tree on every `up`.

**Technologies.** FastAPI + uvicorn (async HTTP), Pydantic (validation + JSON Schema), SQLAlchemy async + asyncpg (runtime DB), psycopg (migrations only), pgvector + Postgres `tsvector` (hybrid retrieval), Alembic (schema), OpenAI SDK against any OpenAI-compatible endpoint (OpenRouter by default — chat + `text-embedding-3-small` embeddings, model-agnostic via `ANSWER_MODEL` / `EMBEDDING_MODEL`), httpx (downstream service calls), structlog + OpenTelemetry (observability).

### Agent

```
   user question (+ JWT → AuthUser{roles, domains})
            │
            ▼
   ┌─────────────────────────────────────────────────┐
   │  Agent.answer  (loop, max_tool_hops = 6)        │
   │                                                 │
   │   messages = [system_prompt, user_question]     │
   │                                                 │
   │   ┌──── while True ──────────────────────────┐  │
   │   │                                          │  │
   │   │   turn = llm.chat(messages, tools)       │  │
   │   │                                          │  │
   │   │   if turn.tool_calls is empty:           │  │
   │   │       extract_citations(turn.text)       │  │
   │   │       return final answer ───────────────┼──┼──► response
   │   │                                          │  │
   │   │   for call in turn.tool_calls:           │  │
   │   │       tool = REGISTRY.get(call.name)     │  │
   │   │       args = tool.Args(**call.args)      │  │
   │   │       result = await tool.run(args, ctx) │  │
   │   │       append tool message to history     │  │
   │   │                                          │  │
   │   └──────────────────────────────────────────┘  │
   └─────────────────────────────────────────────────┘
```

The model decides which tool to call from its JSON-Schema'd description; the loop validates the arguments through the tool's Pydantic `Args`, executes it, feeds the result back, and stops once the model emits an answer with no further tool calls. Tool failures become tool error messages — they never crash the loop.

**Current tools.**

| Name             | Backend           | Purpose                                                            |
| ---------------- | ----------------- | ------------------------------------------------------------------ |
| `search_docs`    | pgvector + tsv    | Hybrid retrieval over ingested docs; returns chunks with citations |
| `list_buildings` | twin-service HTTP | Buildings in a given domain                                        |
| `get_building`   | twin-service HTTP | Full building detail by id                                         |
| `list_rooms`     | twin-service HTTP | Rooms (with capacity, occupancy, temperature) in a building        |
| `get_room`       | twin-service HTTP | Single room state                                                  |

Each tool is a class with `name`, `description`, a Pydantic `Args` model, and an `async run(args, ctx)`; registering it in [app/agent/tools/__init__.py](app/agent/tools/__init__.py) is enough to expose it to the LLM.

### Hybrid retrieval

The `search_docs` tool runs two searches in parallel against the `chunks` table and fuses them. Each method catches what the other misses:

- **Vector search** ([app/retrieval/vector.py](app/retrieval/vector.py)) — pgvector cosine distance (`embedding <=> query`) over `text-embedding-3-small` embeddings (768-dim). Catches semantic matches and paraphrases.
- **Keyword search** ([app/retrieval/keyword.py](app/retrieval/keyword.py)) — Postgres full-text search via `tsvector` + `websearch_to_tsquery` + `ts_rank`. Catches exact terms, identifiers, acronyms, rare words.

Both queries enforce per-chunk permissions (`permissions` JSONB column vs. `user.roles/domains`) so retrieval is access-controlled at the SQL layer.

The pipeline ([app/retrieval/pipeline.py](app/retrieval/pipeline.py), `HybridRetriever.retrieve`) has three stages, each wrapped in an OTel span:

1. **Fan out** — `top_k_vector` vector hits + `top_k_keyword` keyword hits.
2. **Fuse with RRF** — Reciprocal Rank Fusion: each chunk's score is `Σ 1 / (k + rank)` (k=60) across the lists it appears in. Uses *ranks*, not raw scores, so cosine similarity and `ts_rank` merge cleanly without normalization. Chunks ranked highly by both methods bubble to the top.
3. **Rerank** ([app/retrieval/reranker/](app/retrieval/reranker/)) — `Reranker` Protocol re-orders the merged candidates with a stronger model (typically a cross-encoder scoring `(query, chunk)` pairs). Currently a `NoopReranker` placeholder; the seam is there to plug in Cohere Rerank or a local cross-encoder. Final cut is `top_k_final`.

### Citations

Retrieval and citation enforcement are two halves of the same contract. Each retrieved chunk has a stable `id`; the LLM is prompted to cite sources inline as `[^<chunk-id>]` markers. After generation, [app/citations.py](app/citations.py):

- `extract_citations` scans the answer, looks each id up in the retrieved set, and splits markers into **valid** `Citation` objects (for the UI to render as links) vs. **hallucinated** ids the model invented.
- `strip_hallucinated` scrubs the bogus markers from the final text.

This is the existing "output guardrail" referenced under Safety — it prevents the agent from fabricating source references.

## Observability — [app/tracing.py](app/tracing.py)

Every `/ask` request emits one OpenTelemetry trace you can open as a waterfall in
**Langfuse** (self-hosted in the docker stack). The trace shows latency for every
step, and **tokens + cost** for each LLM call.

**Span tree of a request:**

```
POST /ask                         (FastAPIInstrumentor)
└─ agent.answer                    trace IO: question in, answer out, user id, total tokens/cost
   ├─ agent.hop.0                  per-hop token counts + tool-call count
   │  └─ gen_ai.chat <model>       generation: model, in/out tokens, cost (OpenRouter usage.cost)
   ├─ tool.search_docs            tool.name, tool.is_error
   │  ├─ retrieve.embed
   │  ├─ retrieve.vector           retrieve.top_k / retrieve.hits
   │  │  └─ SELECT chunks …        pgvector query (SQLAlchemyInstrumentor)
   │  ├─ retrieve.keyword
   │  └─ retrieve.rerank
   ├─ tool.list_rooms
   │  └─ GET twin-service/…        outbound HTTP (HTTPXClientInstrumentor)
   └─ agent.hop.1 → gen_ai.chat …  final answer turn
```

**How it's wired.** `configure_tracing()` (called from the FastAPI lifespan) sets up a
`TracerProvider` and auto-instruments httpx (twin tools) and SQLAlchemy (pgvector /
keyword search). The LLM generation span and its token/cost attributes live in
[app/agent/llm/openai_compat.py](app/agent/llm/openai_compat.py) via
`tracing.tag_generation`, which sets both the vendor-neutral OTel **GenAI** semantic
conventions (`gen_ai.usage.*`) and the **Langfuse** attribute mapping
(`langfuse.observation.type=generation`, `usage_details`, `cost_details`) so the span
renders as a generation with token/cost columns.

**Exporter.** Controlled entirely by standard OTel env vars:

| Var | Value (dev) | Meaning |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://langfuse-web:3000/api/public/otel` | Langfuse OTLP ingest |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | HTTP exporter (else gRPC) |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic%20<b64(pk:sk)>` | Langfuse project keys |

With **no endpoint set**, the service falls back to a compact one-line console span
exporter (`trace gen_ai.chat 412.3ms`) — no trace backend required for local hacking.

**Opening Langfuse.** UI at `http://localhost:3030` (or `/langfuse` via the gateway,
which redirects there). Project, user, and API keys are provisioned headlessly on
first boot from the `LANGFUSE_INIT_*` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
values in the root `.env`; log in with `LANGFUSE_INIT_USER_EMAIL` /
`LANGFUSE_INIT_USER_PASSWORD`. The backend (langfuse-web/worker, clickhouse, minio,
langfuse-db; reusing the shared redis) lives in the root
[docker-compose.yml](../../docker-compose.yml).

## Dependencies

- **uvicorn**: accepts HTTP requests and hands them to the app (the agent)
- **pydantic**: data validation and parsing library -> exposes tool definitions to the LLM without writing schemas by hand. Pydantic in this service is the single source of truth for every typed boundary.
- **asyncpg**: async PostgreSQL driver for Python, it speaks the Postrgres binary protocol directly

## Linting & type-checking

Two tools, both configured in [pyproject.toml](pyproject.toml) and exposed as scripts in [package.json](package.json) so they can be invoked uniformly from `just lint`:

- **ruff** — linter + formatter. Rule families: `E/W/F` (pycodestyle/pyflakes), `I` (isort), `B` (bugbear), `UP` (pyupgrade), `N` (naming), `S` (bandit/security), `ASYNC`, `SIM`, `PTH`, `TID`, `TCH`, `RUF`, `C4`, `PIE`, `RET`. Tests/evals/alembic have relaxed rules via `per-file-ignores`.
- **pyright** — type-checker in `basic` mode (catches imports, undefined names, obvious type errors; lenient on argument types). Bump to `standard` in `[tool.pyright]` once the codebase is clean.

| Command                  | What it does                                  |
| ------------------------ | --------------------------------------------- |
| `npm run lint`           | `ruff check` + `ruff format --check` + pyright |
| `npm run lint:fix`       | `ruff check --fix` + `ruff format`            |
| `npm run format`         | `ruff format` only                            |
| `npm run typecheck`      | pyright only                                  |

Picked up by `just lint` along with every JS service (each leg invokes `npm --prefix <dir> run lint`).

## OpenAPI

FastAPI auto-generates an OpenAPI 3.1 schema from the Pydantic models and route metadata. While the service is running:

| URL                  | What                                  |
| -------------------- | ------------------------------------- |
| `/openapi.json`      | Raw schema                            |
| `/docs`              | Swagger UI (try-it-out console)       |
| `/redoc`             | ReDoc (read-only reference)           |

To dump a static copy to disk for tracking or codegen:

```bash
npm run openapi   # writes openapi.json + openapi.yaml at the service root
```

Authentication is declared as a `cookieAuth` security scheme (the `authentication_token` JWT cookie issued by `auth-service`). Per-route metadata (`tags`, `summary`, `description`, error responses, examples) lives next to each handler in [app/routes/](app/routes/); request/response field docs live in [app/models/api.py](app/models/api.py).

## Testing

`pytest` + `pytest-asyncio`. Two tiers under [tests/](tests/), kept separate so unit tests stay sub-second and integration tests own the slow Postgres setup.

### Unit tests — [tests/unit/](tests/unit/)

Pure-function tests, no DB, no network, no LLM. Each module under test is exercised in isolation with hand-built inputs:

- [test_chunking.py](tests/unit/test_chunking.py) — `chunk_markdown` invariants: heading paths (`Top > Sub`), code blocks kept atomic with language metadata, tables preserved whole, long prose split with overlap, empty input returns `[]`.
- [test_ranking.py](tests/unit/test_ranking.py) — `_rrf_merge` math: shared hits rank above single-list hits, scores are monotonically decreasing.
- [test_citations.py](tests/unit/test_citations.py) — `extract_citations` splits valid vs. hallucinated chunk ids, dedupes repeated markers; `strip_hallucinated` removes only the bad ones.
- [test_prompts.py](tests/unit/test_prompts.py) — system prompt contains the IDK contract and the `[^chunk_id]` citation instruction. Catches accidental prompt edits that would break the agent's output contract.

### Integration tests — [tests/integration/](tests/integration/)

Real Postgres (pgvector + tsvector), real Alembic migrations, fake LLM/embedder. Hermetic via [testcontainers](https://github.com/testcontainers/testcontainers-python): a `pgvector/pgvector:pg17` container is spun up once per test session (see [conftest.py](tests/integration/conftest.py)), `alembic upgrade head` runs against it, and `POSTGRES_URL` is patched into the env so app code uses the container.

Fixtures:

- `pg_container` (session) — starts the container, yields the asyncpg URL.
- `engine` (session) — async SQLAlchemy engine with migrations applied.
- `session` (function) — fresh `AsyncSession`; rolls back and `TRUNCATE chunks, documents RESTART IDENTITY CASCADE` after each test for isolation without paying the migration cost again.

A `FakeEmbedder` ([test_ingest_and_ask.py](tests/integration/test_ingest_and_ask.py)) hashes input text into a deterministic 768-dim unit vector — exercises the real pgvector column and SQL path without calling the embeddings API. The same trick will be used for the LLM: a fake `LLMClient` that scripts `tool_calls` so we can assert the agent loop dispatches `search_docs` / twin tools correctly without burning tokens.

What's covered today: `ingest_document` idempotency on content hash. What's missing (tracked under Roadmap → Code quality): the two end-to-end `Agent.answer` tests dropped during the tool-calling rewrite — to be rewritten against the new shape with a scripted `LLMClient`.

### Evals — [evals/](evals/)

Separate from the test pyramid. [evals/dataset.jsonl](evals/dataset.jsonl) is a fixed Q&A set; [evals/run_evals.py](evals/run_evals.py) calls the real OpenRouter-backed agent and grades retrieval recall + answer quality. Not run in `pytest` (costs money, non-deterministic) — meant to be wired into a separate `npm run eval` and a CI job gated to PRs touching `app/agent/**` or `app/retrieval/**`.

### Running

```
npm run test        # pytest tests/   (unit + integration)
npm run test:unit   # tests/unit only — fast, no Docker
```

Integration tests require Docker (testcontainers); unit tests don't.

## DB

### is it really necessary to have a db here?

The db exists to store doc chunks with their embeddings and a permission filter so retrieval is fast and access controlled; without it, we'd have to re-embed and scan documents on every query, which is slow and doesn't scale past a handlful of files.

### small string lots of meaning, the connection URL

in the config.py file we have:

```Python
postgres_url: str = Field(
    default="postgresql+asyncpg://agent:agent@agent-db:5432/agentdb",
    alias="POSTGRES_URL",
)
```

where:

- postgresql+asyncpg => dialect + driver tell SQLAlchemy: this is Postgres, use asyncpg to talk to it
- agent:agent => username and password (TODO change them)
- agent-db => the host: Docker's DNS resolves it to the agent-db container's IP
- 5432 => classic postgres port
- agentdb => the database name (because potgres can host many DBs in one server)

If we want to change db we can just switch to a different driver in here

## Roadmap / TODO

### Capabilities — make the agent more useful

- **More tools.** The current toolset is read-only twin + doc search. Worth adding:
  - `get_occupancy_history(room_id, window)` — backed by twin-service or a new time-series store; lets the agent answer "is meeting room A typically full at 3pm?"
  - `list_alerts` / `get_notifications` — read from notification-service so the agent can summarize active incidents.
  - `get_user_permissions` — so the agent can explain "why can't I see building X?" without leaking other domains.
  - Action tools (with confirmation): `send_notification`, `book_room`. These need a write-tool guardrail (see Safety below).
- **MCP integration.** Two angles:
  - *As an MCP client* — let the agent talk to external MCP servers (filesystem, GitHub, Linear, Slack). Easiest path: pydantic-ai already supports MCP; we'd swap the local `REGISTRY` for an MCP-backed tool source or compose both.
  - *As an MCP server* — expose `search_docs` / twin tools over MCP so Claude Desktop, Cursor, etc. can query Crowd-Vision directly. Mostly a thin transport on top of the existing tool registry.
- **Real per-token streaming of the final turn.** Today `stream_answer` fakes streaming by emitting the full answer as one token (see [app/agent/loop.py](app/agent/loop.py)). Re-run the last turn with `stream()` and no tools after the loop converges.

### Safety / guardrails

- **Input guardrails** — prompt-injection / jailbreak heuristics, max question length, PII scrub. New `app/agent/guardrails.py` module called at the top of `Agent.answer`.
- **Per-tool authorization** — add `authorize(ctx, args)` hook on the `Tool` base class; enforce RBAC using `ctx.user.roles`/`domains` (currently only enforced inside individual tools, inconsistently).
- **Per-request budgets** — cap total tool calls, per-tool repeat count, total tokens / cost. Today only `max_tool_hops` is enforced.
- **Output guardrails** — scope-leak check (does the answer reference domains the caller can't see?), toxicity filter. Existing citation validator already handles hallucinated chunk ids.
- **Write-tool confirmation** — once we add action tools, require an explicit confirmation turn before executing.

### Code quality / reliability

- **Stale integration tests.** The two agent-flow tests in `tests/integration/test_ingest_and_ask.py` were dropped during the tool-calling rewrite — only the ingest idempotency test remains. Rewrite them against the new `Agent.answer(session, question, user)` shape with a fake `LLMClient` that scripts tool calls.
- **Chunker `table` kind regression.** `test_table_preserved_as_single_chunk` fails: `chunk_markdown` doesn't emit chunks with `kind="table"` for pipe tables. Either fix the chunker or update the test if the policy changed.
- **Pyright `standard` mode.** Currently `basic`. The 14 errors that previously blocked the upgrade are fixed — codebase is clean under `basic`. Summary of the fixes:
  - `app/agent/llm/openai_compat.py`: messages/tools `cast` to `ChatCompletionMessageParam` / `ChatCompletionToolUnionParam`; `tools=None` replaced with the OpenAI SDK's `omit` sentinel (the SDK distinguishes "omitted" from "explicitly None"). Internal flat tool-call messages are translated to OpenAI's nested `function.arguments` (JSON string) shape before sending.
  - `app/agent/tools/base.py`: `Tool` is now a generic protocol `Tool(Protocol[ArgsT])` with `ArgsT = TypeVar("ArgsT", bound=BaseModel)`. Concrete tools satisfy it structurally without changes; `ToolRegistry` stores/exposes `Tool[Any]`. This resolves the LSP violation where each concrete tool narrowed `Args: type[BaseModel]` and `run(args: BaseModel, ...)` to its own Pydantic model.
  - Test imports parked behind commented-out tests now carry both `# noqa: F401` (ruff) and `# pyright: ignore[reportUnusedImport]` (pyright) per name, so they survive ruff's multi-line reformat.

  Next step: bump `[tool.pyright].typeCheckingMode` from `basic` to `standard` and address the new diagnostics it surfaces.
- **Drop tracked `__pycache__` / `.pyc`.** Add to `server/agent-service/.gitignore` and `git rm --cached` the existing ones before any further commits.
- **Postgres credentials.** `agent:agent` default in `app/config.py` — wire to `.env` like the other services.

### Tests & evaluations

Coverage today is a thin slice — the hardest behaviors (the agent loop, retrieval quality, the LLM contract) aren't tested yet. Still TBD which of these are worth the time vs. relying on evals; needs more thought before committing to a shape:

- More integration tests around `Agent.answer` and `HybridRetriever.retrieve`, plus per-tool tests against mocked twin-service.
- A real model-evaluation setup on top of [evals/](evals/) — bigger dataset, retrieval metrics (recall@k, MRR), answer-quality metrics (LLM-as-judge faithfulness, citation precision), and some kind of regression budget in CI.

### Observability & ops

- **Cost dashboard.** `Usage` is captured per request but not exported. Push to an OTel meter or add a `/metrics` Prometheus endpoint.
- **Eval harness in CI.** `evals/` exists; wire `npm run eval` and a GH Actions job that runs against a fixed dataset on PRs touching `app/agent/**` or `app/retrieval/**`.
- **Trace propagation.** Confirm spans from `agent.hop.N` and `tool.<name>` make it through to the OTLP collector and link to upstream HTTP spans.