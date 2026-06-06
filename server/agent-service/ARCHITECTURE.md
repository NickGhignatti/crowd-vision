# Agent Service Architecture

This document explains the stable internal design of `agent-service`. For setup, commands,
API examples, and troubleshooting, use [README.md](README.md).

## System Context

```text
client / API caller
       |
       | HTTP through Caddy at /agent/*
       v
agent-service (FastAPI)
       |
       +-- OpenAI-compatible provider: chat, tool calling, embeddings
       +-- agent-db (Postgres + pgvector): documents, chunks, full-text index
       +-- twin-service: live building and room state
       +-- OTLP collector / Langfuse: traces, generations, tokens, cost
```

The container runs `alembic upgrade head` before starting Uvicorn. In the development
stack, `agent-ingester` waits for `/health` and then loads the repository documentation.

## Request Lifecycle

### Ask

`POST /ask` decodes the caller JWT into an `AuthUser`, then passes the question, user, and
database session to `Agent`.

```text
question + AuthUser
       |
       v
bootstrap system/user messages
       |
       v
LLM chat with registered tool schemas
       |
       +-- tool calls --> validate args --> execute tools --> append results --+
       |                                                                    |
       +---------------------- repeat up to MAX_TOOL_HOPS <-----------------+
       |
       v
final text --> validate citations --> strip invented markers --> response
```

The model chooses tools from JSON schemas generated from their Pydantic argument models.
Tool errors are returned to the model as tool-result messages so it can recover. Reaching
`MAX_TOOL_HOPS` returns the IDK marker with `decision=tool_loop_exhausted`.

`stream=true` uses the same tool loop and emits the completed answer as one SSE `token`
event, followed by a `done` event. It is not currently per-token model streaming.

### Ingest

`POST /ingest` performs:

1. SHA-256 content-hash lookup; identical content is skipped.
2. Markdown-aware chunking that preserves headings, fenced code, and tables.
3. Batch embedding through the configured OpenAI-compatible provider.
4. Storage in `documents` and `chunks`.

Each chunk stores its text, embedding, generated `tsvector`, permissions, source metadata,
and section path.

## Tools

Tools are registered in [app/agent/tools/__init__.py](app/agent/tools/__init__.py).

| Tool | Backend | Purpose |
| --- | --- | --- |
| `search_docs` | agent-db | Search ingested documentation and provide citation candidates |
| `list_buildings` | twin-service | List buildings for a domain |
| `get_building` | twin-service | Fetch one building by ID |
| `list_rooms` | twin-service | List room occupancy, capacity, and temperature |
| `get_room` | twin-service | Fetch one room by ID |

Every tool exposes:

- A stable `name` and model-facing `description`.
- A Pydantic `Args` model.
- `async run(args, ctx) -> ToolResult`.

`ToolContext` carries the authenticated user, database session, and citation accumulator.
For the extension contract, see [ADDING_TOOLS.md](ADDING_TOOLS.md).

## Retrieval

`search_docs` calls `HybridRetriever.retrieve`, which currently performs these stages
sequentially:

1. Embed the query.
2. Run pgvector cosine-similarity search.
3. Run Postgres full-text search using `tsvector` and `websearch_to_tsquery`.
4. Merge both rankings with Reciprocal Rank Fusion.
5. Pass merged candidates through the configured reranker.
6. Return the top `TOP_K_FINAL` chunks.

The only implemented reranker is currently `noop`.

Both SQL searches enforce chunk permissions:

```text
chunk permissions are empty
OR
chunk permissions overlap the caller's JWT roles/domains
```

This makes documentation retrieval permission-aware at the database query boundary.
The current twin-service tools do not apply `ToolContext` authorization or forward the
caller's token. Treat them as suitable only for data that the downstream route intentionally
exposes; add explicit authorization before introducing sensitive or write-capable tools.

## Citations

The system prompt instructs the model to cite retrieved chunks as `[^<chunk-id>]`.
After generation:

1. `extract_citations` resolves markers against chunks actually returned by `search_docs`.
2. Valid markers become response citation objects.
3. Unknown markers are reported in `retrieval.hallucinated_citations`.
4. `strip_hallucinated` removes unknown markers from the displayed answer.

This validates source references; it does not prove that every factual claim is supported.

## Authentication And Permissions

Protected routes accept:

- The configured JWT cookie, `authentication_token` by default.
- An `Authorization: Bearer <jwt>` header.

JWTs are verified using HS256 and `JWT_SECRET`. Roles and domains are collected from direct
claims and `accountMemberships`, then combined into `AuthUser.permissions`.

`REQUIRE_AUTH=false` creates an anonymous user and is intended only for isolated local use.

## Database

Alembic creates:

- `documents`: source, content hash, metadata, permissions.
- `chunks`: document relation, text, section, kind, embedding, generated `tsvector`,
  permissions, and metadata.
- pgvector IVFFlat, full-text GIN, permission GIN, and document relation indexes.

The initial migration defines `embedding vector(768)`. Changing `EMBEDDING_DIM` therefore
requires a matching schema migration and re-ingestion; an environment-variable change alone
is insufficient.

Runtime queries use async SQLAlchemy with `asyncpg`. Alembic uses a synchronous Postgres
driver for migrations.

## Observability

FastAPI, SQLAlchemy, and outbound `httpx` calls are instrumented with OpenTelemetry.
Application spans include:

```text
agent.answer
  agent.hop.N
    gen_ai.chat <model>
  tool.<name>
    retrieve.embed
    retrieve.vector
    retrieve.keyword
    retrieve.rerank
```

Generation spans record model, input/output tokens, and estimated or provider-reported cost.
With `OTEL_EXPORTER_OTLP_ENDPOINT` configured, spans are exported over OTLP. Without it,
compact span summaries are printed to the console.

## Tests And Evaluations

- `tests/unit/`: hermetic tests for chunking, ranking, citations, and prompts.
- `tests/integration/`: Testcontainers/Postgres scaffolding; current agent-flow coverage is
  limited and the ingest test is parked.
- `evals/`: real-agent golden-dataset runner that grades tool choice, sources, keywords,
  citations, and IDK behavior.

Evaluations are intentionally separate from pytest because they require a running stack,
real provider calls, and may incur cost. See [evals/README.md](evals/README.md).

## Key Modules

| Module | Responsibility |
| --- | --- |
| `app/main.py` | FastAPI lifecycle, routes, and OpenAPI |
| `app/agent/loop.py` | Tool loop, usage aggregation, citations, SSE |
| `app/agent/llm/` | OpenAI-compatible provider adapter and cost calculation |
| `app/agent/tools/` | Tool protocol, registry, and implementations |
| `app/services/ingest.py` | Idempotent document ingestion |
| `app/chunking/` | Markdown-aware chunking |
| `app/retrieval/` | Vector search, keyword search, RRF, reranking |
| `app/citations.py` | Citation validation and cleanup |
| `app/auth.py` | JWT decoding and permission extraction |
| `app/tracing.py` | OpenTelemetry configuration and generation tags |
