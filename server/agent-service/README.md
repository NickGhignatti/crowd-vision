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
and runs the one-shot `agent-ingester` over `documentation/user` and
`documentation/developer`.

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
| Run real-agent golden-dataset evaluations (**root**) | `just eval` |
| Compare answer models end to end (**root**) | `just eval models="model-a,model-b"` |
| Export `openapi.json` and `openapi.yaml` | `npm run openapi` |
| Apply database migrations | `uv run alembic upgrade head` |

Provider verification and evals make real model requests and may incur cost. Local evals
automatically mint short-lived JWTs from the root `.env`; remote and CI runs require an
explicit `AUTH_COOKIE`. Evals require a running, already-ingested stack; see
[evals/README.md](evals/README.md) for dataset fields and scoring rules.

An eval summary such as `15/16 passed` followed by `recipe 'eval' failed ... exit code 1`
means the run completed but at least one golden-dataset row failed. Find the preceding
`[FAIL]` line for the row id and reason. The non-zero exit is intentional so evals can gate
CI.

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

Privileged callers can add `"model":"google/gemini-2.5-flash"` to override the answer model
for one request. The caller must meet `MODEL_OVERRIDE_MIN_ROLE` and, when `ALLOWED_MODELS`
is non-empty, the model must be allowlisted. The override spends the server's shared
provider balance; it does not change the embedding model.

`AskRequest.top_k` is present in the API model but is not currently wired into retrieval;
`search_docs` chooses its own `top_k`, while the retrieval pipeline uses the configured
`TOP_K_VECTOR`, `TOP_K_KEYWORD`, and `TOP_K_FINAL` values.

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
available to every authenticated user. `/ingest` currently requires authentication but
does not enforce an administrator role; treat it as an internal endpoint.

The repository ingester loads `.qd`, `.md`, and `.markdown` files from
`documentation/user` and `documentation/developer`. Re-ingestion is content-hash
idempotent, but it does not delete older versions when a source file changes. For a clean
knowledge-base rebuild, clear the agent tables before ingesting again.

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
| `LLM_TEMPERATURE` | `0.2` | Default generation temperature (`0` to `2`) |
| `MAX_OUTPUT_TOKENS` | `2048` | Maximum generated tokens for each provider call |
| `MODEL_OVERRIDE_MIN_ROLE` | `business_admin` | Minimum JWT role allowed to override the answer model |
| `ALLOWED_MODELS` | empty | Optional comma-separated override allowlist; empty permits any model for privileged callers |
| `LLM_TIMEOUT_SECONDS` / `EMBED_TIMEOUT_SECONDS` | `30` / `15` | Provider request timeouts |
| `POSTGRES_URL` | Docker-local agent DB | Async SQLAlchemy connection URL |
| `JWT_SECRET` | empty | Must match `auth-service` |
| `JWT_COOKIE_NAME` | `authentication_token` | JWT cookie read by protected routes |
| `REQUIRE_AUTH` | `true` | Protect `/ask` and `/ingest` |
| `TWIN_SERVICE_URL` / `TWIN_TIMEOUT_SECONDS` | `http://twin-service:3000` / `10` | Live-data backend and request timeout |
| `TOP_K_VECTOR` / `TOP_K_KEYWORD` / `TOP_K_FINAL` | `20` / `20` / `6` | Retrieval depths |
| `RERANKER` | `noop` | Retrieval reranker implementation |
| `MAX_TOOL_HOPS` | `6` | Maximum agent loop iterations |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | OTLP trace destination; console spans if empty |
| `OTEL_EXPORTER_OTLP_PROTOCOL` / `OTEL_EXPORTER_OTLP_HEADERS` | empty | OTLP transport and authentication |
| `LOG_LEVEL` / `LOG_FORMAT` | `INFO` / `auto` | Logging controls; `auto` uses console without OTLP and JSON with OTLP |

The complete source of truth is [app/config.py](app/config.py). With the full stack running,
LLM traces, tool calls, latency, tokens, and cost are visible in Langfuse at
`http://localhost:3030`.

`CORS_ORIGINS` exists in settings but is not currently consumed by FastAPI middleware.
Invalid numeric bounds, unsupported role/log-format values, and malformed service URL schemes
fail during settings loading. Service startup also fails when the provider key is missing, or
when authentication is enabled without `JWT_SECRET`.

### Langfuse Login

The Docker Compose stack provisions Langfuse with these local defaults:

```text
email:    admin@crowd-vision.local
password: langfuse-admin
```

Override `LANGFUSE_INIT_USER_EMAIL` and `LANGFUSE_INIT_USER_PASSWORD` in the root `.env`
before Langfuse starts for the first time. These initialize the first account; changing
them later does not update an existing login. Langfuse is not deployed by the current
Kubernetes manifests. The Compose stack also requires Langfuse project/infrastructure
secrets and `OTEL_EXPORTER_OTLP_*` variables; `just env` does not currently generate them.

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

The recommended configuration is one `OPENROUTER_API_KEY` for the default
`https://openrouter.ai/api/v1` endpoint. `LLM_API_KEY`, `DEEPSEEK_API_KEY`, and
`GOOGLE_API_KEY` are accepted as legacy aliases, but the key must belong to the configured
`LLM_BASE_URL`.

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

### Model Override Returns `400` Or `403`

- `403`: the JWT does not meet `MODEL_OVERRIDE_MIN_ROLE`.
- `400`: `ALLOWED_MODELS` is configured and the requested model is not listed.
- An empty `ALLOWED_MODELS` does not disable overrides; it permits any model for callers
  that satisfy the role gate.

### Kubernetes Agent Has Provider Or Retrieval Problems

The current Kubernetes manifests deploy `agent-service` and `agent-db`, but do not deploy
Langfuse or the one-shot documentation ingester. Verify the `agent-service-secret`
contains a provider key compatible with `LLM_BASE_URL`, then ingest documents manually
through `/agent/ingest` after deployment.
