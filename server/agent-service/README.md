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
just setup install                 # install Python and monorepo dependencies
just stack dev                     # start the full stack; docs are ingested automatically
just stack logs agent-service      # follow agent logs
curl http://localhost/agent/health
```

`just stack dev` generates `.env`, starts `agent-service` + pgvector, runs Alembic migrations,
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
| Start the development stack (**root**) | `just stack dev` |
| Rebuild and start (**root**) | `just stack dev-build` |
| Follow service logs (**root**) | `just stack logs agent-service` |
| Re-ingest all documentation (**root**) | `just agent ingest` |
| Clear all service databases, including the agent KB (**root**) | `just db clear` |
| Run agent tests through Moon (**root**) | `just test agent` |
| Run integration tests (**root**, Docker required) | `just test agent-integration` |
| Run all local tests | `npm test` |
| Run only fast unit tests | `uv run pytest tests/unit` |
| Lint, format-check, and type-check | `npm run lint` |
| Apply lint and formatting fixes | `npm run lint:fix` |
| Verify the configured LLM + embedding provider | `uv run python scripts/verify_provider.py` |
| Run real-agent golden-dataset evaluations (**root**) | `just eval` |
| Compare answer models end to end (**root**) | `just eval models="model-a,model-b"` |
| Export `openapi.json` and `openapi.yaml` | `npm run openapi` |
| Apply database migrations | `uv run alembic upgrade head` |

Provider verification and evals make real model requests and may incur cost. See
[Evaluation](#evaluation) below for the full workflow.

## Documentation Map

This README is the operational guide: setup, commands, API usage, configuration, evaluation,
and troubleshooting. The design-level documentation lives in the Quarkdown **Developer Guide**:

| Topic | Source |
| --- | --- |
| Agent architecture, retrieval, citations, auth, observability | `documentation/developer/services/agent.qd` |
| Chat-service and the end-to-end chat flow | `documentation/developer/services/chat.qd` |
| Implementing, registering, and testing a new tool | `documentation/developer/contributing/adding-agent-tools.qd` |

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

In short: `/ask` runs a tool-calling loop — the model picks tools from generated JSON schemas,
the loop runs them and feeds results back until the model answers or hits `MAX_TOOL_HOPS`,
retrieval is filtered against the caller's JWT roles/domains, and invented citation markers are
stripped. For the full design — request lifecycle, hybrid retrieval and RRF, citation
validation, auth, and observability — see `documentation/developer/services/agent.qd`.

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

To add an agent capability, implement and register a tool under `app/agent/tools/`. See
`documentation/developer/contributing/adding-agent-tools.qd` for the complete contract and
checklist, and `documentation/developer/services/agent.qd` for deeper system internals.

## Evaluation

`evals/dataset.json` is a **golden dataset**: "hand-written" questions, each paired with the
behavior expected of the agent. `evals/run_evals.py` sends every row to the real `/ask` and
grades the response. For the design rationale (why a golden dataset, deterministic vs.
LLM-judge), see `documentation/developer/services/agent.qd`; this section is the operational
reference. Evals need a running, already-ingested stack and make real provider calls.

```bash
just eval                                       # default model + default judge (report-only)
just eval models="openai/gpt-4o-mini,google/gemini-2.5-flash"  # compare answer models end to end
just eval judge="anthropic/claude-haiku-4-5"    # choose the judge model

# direct invocation (from server/agent-service):
uv run python evals/run_evals.py --role admin --domain unibo.it
# remote/CI: minting is local-only, so pass a cookie explicitly:
AGENT_URL=https://example.com/agent AUTH_COOKIE="authentication_token=<jwt>" \
  uv run python evals/run_evals.py
```

For local URLs the runner mints a fresh short-lived JWT per request from `JWT_SECRET` (env or
root `.env`); remote URLs require `AUTH_COOKIE`. `EVAL_TIMEOUT_SECONDS` raises the per-request
timeout for slow sweeps.

### Dataset fields

Each row asserts only the fields it specifies, so a row checks exactly the behavior it cares
about. All present assertions must hold (one passing check cannot mask another failure).

| Field | Meaning |
| --- | --- |
| `id` | Stable row id, e.g. `cv-doc-001` |
| `category` | Curation aid: `docs_retrieval` · `live_data` · `conversational` · `out_of_scope` |
| `question` | The prompt sent to `/ask` |
| `expected_tool` | Tool that must appear in the tool-call trace |
| `expected_no_tool` | If true, the agent must answer without calling any tool |
| `expected_sources` | Repo-relative doc path(s); ≥1 citation source must match (substring) |
| `must_cite` | If true, the answer must include at least one citation |
| `expected_keywords` | Lowercase substrings that must all appear in the answer |
| `expected_idk` | If true, the response `idk` flag must be true (unknown in-scope answer) |
| `llm_judge` | Semantic rubric to apply, currently `out_of_scope_refusal` |
| `key_facts` / `ideal_answer` | Human reference, not auto-scored |
| `xfail` (+ `xfail_reason`) | Marks an accepted, tracked gap; the reason is required |

Keep `expected_keywords` to 1–2 robust tokens (avoid flaky phrasing failures); put the fuller
expectation in `key_facts`/`ideal_answer`. Use `llm_judge` only where deterministic checks
can't capture the behavior; keep tool, source, citation, and keyword checks deterministic. When
a user reports a wrong answer, add a row **before** fixing it.

### Scope contract

Unknown *in-scope* questions return the IDK marker (`I don't know based on the available
data.`). *Out-of-scope* questions must decline or redirect to CrowdVision's scope without
fulfilling the request and without calling a tool — measured by the `out_of_scope_refusal`
judge plus deterministic `expected_no_tool`. Greetings are in scope and answered directly.

### Statuses and exit code

A dataset row marked `xfail` is a **known, accepted gap** that must carry an `xfail_reason`.
The runner classifies every row into one of four statuses, mirroring pytest's expected-failure
model:

| Status | Meaning | Fails the run? |
| --- | --- | --- |
| `PASS` | a normal row met its assertions | no |
| `FAIL` | a normal row failed, or any row hit an infra error (timeout, non-200, bad JSON) | **yes** |
| `XFAIL` | an `xfail` row failed — exactly what its `xfail_reason` predicts | no |
| `XPASS` | an `xfail` row unexpectedly **passed** — the gap is fixed, so its marker is now stale | only with `--strict` |

The pairing is the useful part: an accepted gap (`XFAIL`) keeps the build green while staying
counted on every run, and a fixed gap (`XPASS`) nudges you to delete its now-stale marker.
Direct runner invocations exit non-zero on `FAIL`; `just eval` is report-only for scored
results (so `FAIL`/`XPASS` stay visible without failing the recipe), but setup and preflight
errors still fail. Infra errors always report `FAIL`, even on an `xfail` row, so an outage can
never masquerade as an accepted gap.

### Judge configuration

The semantic judge is configured independently of the answer model: `JUDGE_MODEL` (default
`google/gemini-2.5-flash`), with `JUDGE_API_KEY` and `JUDGE_BASE_URL` falling back to the normal
LLM/OpenRouter settings. The default is a *different* model family from the answer model to
reduce self-preference bias. Judge request or parsing errors always report `FAIL`, including on
an `xfail` row.

> **Model sweeps are privileged.** A per-request `model` override spends the shared provider
> balance, so the eval JWT must hold a role at/above `MODEL_OVERRIDE_MIN_ROLE` (else `403`) and,
> when `ALLOWED_MODELS` is non-empty, the model must be listed (else `400`).

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
| `OBSERVE_PAYLOADS` | `false` | Include bounded query, document-preview, and tool I/O payloads in traces; development Compose defaults to `true` |
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
secrets and `OTEL_EXPORTER_OTLP_*` variables; `just stack env` does not currently generate them.

## Troubleshooting

### `/ask` Or `/ingest` Returns `401`

- Confirm the request includes `authentication_token=<jwt>` or a Bearer token.
- Confirm `JWT_SECRET` matches the secret used by `auth-service`.
- Regenerate the local environment with `just stack env` if the token or secret is stale.

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
just agent ingest            # from the repository root
just stack logs agent-service
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
