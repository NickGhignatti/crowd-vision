# Agent Service

Tool-calling RAG agent for CrowdVision. It answers questions using:

- `search_docs`: permission-filtered hybrid search over ingested documentation.
- `list_buildings`, `get_building`, `list_rooms`, `get_room`: live data from `twin-service`.
- An OpenAI-compatible provider for chat, tool calling, and embeddings.
- Inline citations, token/cost usage, tool-call traces, and OpenTelemetry spans.

The service is exposed through the gateway at `http://localhost/agent`; inside Docker it
listens at `http://agent-service:3000`.

## Quick Start

From the repository root:

```bash
just install                 # install Python and monorepo dependencies
just dev                     # start the full stack; docs are ingested automatically
just logs agent-service      # follow agent logs
curl http://localhost/agent/health
```

`just dev` generates `.env`, starts `agent-service` + pgvector, runs Alembic migrations,
and runs the one-shot `agent-ingester` over `documentation/`.

For direct-process debugging while Postgres and downstream services are already running,
run from `server/agent-service`:

```bash
uv sync --locked
set -a; source ../../.env; set +a
POSTGRES_URL=postgresql+asyncpg://agent:agent@localhost:5432/agentdb \
  uv run alembic upgrade head
POSTGRES_URL=postgresql+asyncpg://agent:agent@localhost:5432/agentdb \
  uv run uvicorn app.main:app --reload --port 3000
```

## What You Can Do

Commands marked **root** run from the repository root; the others run from
`server/agent-service`.

| Task | Command |
| --- | --- |
| Start the development stack (**root**) | `just dev` |
| Rebuild and start (**root**) | `just dev-build` |
| Follow service logs (**root**) | `just logs agent-service` |
| Re-ingest all documentation (**root**) | `just agent-ingest` |
| Clear all service databases, including the agent KB (**root**) | `just db-clear` |
| Run agent tests through Moon (**root**) | `just test-agent` |
| Run integration tests (**root**, Docker required) | `just test-agent-integration` |
| Run all local tests | `npm test` |
| Run only fast unit tests | `uv run pytest tests/unit` |
| Lint, format-check, and type-check | `npm run lint` |
| Apply lint and formatting fixes | `npm run lint:fix` |
| Verify the configured LLM + embedding provider | `uv run python scripts/verify_provider.py` |
| Run real-agent golden-dataset evaluations | `AUTH_COOKIE="authentication_token=<jwt>" uv run python evals/run_evals.py` |
| Export `openapi.json` and `openapi.yaml` | `npm run openapi` |
| Apply database migrations | `uv run alembic upgrade head` |

Provider verification and evals make real model requests and may incur cost. Evals require a
running, already-ingested stack; see [evals/README.md](evals/README.md) for dataset fields
and scoring rules.

## Documentation Map

| Document | Use it for |
| --- | --- |
| [README.md](README.md) | Setup, commands, API usage, configuration, troubleshooting |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Agent loop, retrieval, permissions, database, tracing |
| [ADDING_TOOLS.md](ADDING_TOOLS.md) | Implementing, registering, and testing a new tool |
| [evals/README.md](evals/README.md) | Golden-dataset fields, scoring, and evaluation workflow |

## API

`/health` is public. `/ask` and `/ingest` require the JWT issued by `auth-service`, supplied
as the `authentication_token` cookie or a Bearer token. Set `REQUIRE_AUTH=false` only for
isolated local development.

### Ask With JSON

```bash
curl -s http://localhost/agent/ask \
  -H "Content-Type: application/json" \
  -H "Cookie: authentication_token=<jwt>" \
  -d '{"question":"Which rooms are over capacity right now?","stream":false}'
```

The response contains `answer`, resolved `citations`, token/cost `usage`, the tool-call
trace under `retrieval.tool_calls`, `idk`, and `decision`.

### Ask With SSE

```bash
curl -N http://localhost/agent/ask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt>" \
  -d '{"question":"How does CrowdVision authentication work?","stream":true}'
```

The stream emits a `token` event followed by a `done` event with citations, usage, tool
calls, and the final decision. Streaming currently sends the completed answer as one token
event after tool execution.

### Ingest One Document

```bash
curl -s http://localhost/agent/ingest \
  -H "Content-Type: application/json" \
  -H "Cookie: authentication_token=<jwt>" \
  -d '{
    "source":"documentation/example.md",
    "content":"# Example\n\nCrowdVision example content.",
    "metadata":{"team":"platform"},
    "permissions":["acme"]
  }'
```

Ingestion chunks Markdown, creates embeddings, and stores vector + full-text indexes.
Identical content hashes are skipped. An empty `permissions` list makes a document
available to every authenticated user.

Interactive API documentation is available at `/agent/docs`; the raw schema is at
`/agent/openapi.json`.

## How It Works

```text
question + JWT roles/domains
        |
        v
  Agent tool loop -----------------------> twin-service live data
        |
        +--> search_docs
               |
               +--> vector search (pgvector)
               +--> keyword search (Postgres tsvector)
               +--> reciprocal-rank fusion + reranker
        |
        v
answer + validated citations + usage + tool trace
```

The LLM chooses tools from Pydantic-generated JSON schemas. The loop validates arguments,
executes tools, feeds results back to the model, and stops when the model returns a final
answer or `MAX_TOOL_HOPS` is reached. Retrieved documents are filtered against JWT roles and
domains at query time. Citation markers invented by the model are removed from the answer
and reported in `retrieval.hallucinated_citations`.

## Project Structure

```text
app/
  main.py                 FastAPI app, lifespan, and OpenAPI metadata
  config.py               environment-backed settings
  auth.py                 JWT decoding and user permissions
  agent/
    loop.py               tool-calling loop, usage, citations, streaming
    prompts.py            system prompt and IDK contract
    llm/                  OpenAI-compatible client and pricing
    tools/                registry, document search, and twin-service tools
  chunking/               Markdown-aware chunking
  embeddings/             embedding provider adapter
  retrieval/              vector, keyword, RRF, and reranking pipeline
  routes/                 /health, /ask, and /ingest
  services/ingest.py      idempotent document ingestion
alembic/                  pgvector documents/chunks schema and migrations
evals/                    golden dataset and real-agent evaluation runner
scripts/                  provider smoke test and OpenAPI export
tests/unit/               hermetic, fast behavior tests
tests/integration/        Postgres/testcontainers integration tests
```

To add an agent capability, implement and register a tool under `app/agent/tools/`.
See [ADDING_TOOLS.md](ADDING_TOOLS.md) for the complete contract and checklist. For deeper
system internals, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` / `LLM_API_KEY` | empty | OpenAI-compatible provider key |
| `LLM_BASE_URL` | `https://openrouter.ai/api/v1` | Provider endpoint |
| `ANSWER_MODEL` | `openai/gpt-4o-mini` | Chat and tool-calling model |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Embedding model |
| `EMBEDDING_DIM` | `768` | Must match the database vector dimension |
| `POSTGRES_URL` | Docker-local agent DB | Async SQLAlchemy connection URL |
| `JWT_SECRET` | empty | Must match `auth-service` |
| `REQUIRE_AUTH` | `true` | Protect `/ask` and `/ingest` |
| `TWIN_SERVICE_URL` | `http://twin-service:3000` | Live-data backend |
| `TOP_K_VECTOR` / `TOP_K_KEYWORD` / `TOP_K_FINAL` | `20` / `20` / `6` | Retrieval depths |
| `RERANKER` | `noop` | Retrieval reranker implementation |
| `MAX_TOOL_HOPS` | `6` | Maximum agent loop iterations |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | OTLP trace destination; console spans if empty |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / `auto` | Logging controls |

The complete source of truth is [app/config.py](app/config.py). With the full stack running,
LLM traces, tool calls, latency, tokens, and cost are visible in Langfuse at
`http://localhost:3030`.

## Troubleshooting

### `/ask` Or `/ingest` Returns `401`

- Confirm the request includes `authentication_token=<jwt>` or a Bearer token.
- Confirm `JWT_SECRET` matches the secret used by `auth-service`.
- Regenerate the local environment with `just env` if the token or secret is stale.

### Provider Requests Fail

Load the root environment and run the provider smoke test:

```bash
set -a; source ../../.env; set +a
uv run python scripts/verify_provider.py
```

It verifies resolved provider settings, tool-calling support, and embedding dimensions.

### Document Questions Return No Useful Results

```bash
just agent-ingest            # from the repository root
just logs agent-service
```

Confirm ingestion succeeds and that document permissions overlap the caller's JWT roles or
domains. Empty document permissions are visible to every authenticated caller.

### Embedding Dimension Errors

The database schema currently stores `vector(768)`. `EMBEDDING_DIM` must match it. Changing
the dimension requires a schema migration and re-ingestion, not only an environment change.

### Live Building Or Room Tools Fail

Confirm `twin-service` is running and `TWIN_SERVICE_URL` is reachable from where the agent
runs. The Docker default `http://twin-service:3000` does not resolve from a host process;
override it with the host-accessible twin-service URL when debugging outside Docker.
