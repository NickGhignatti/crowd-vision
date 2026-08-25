# agent

Python / FastAPI / Postgres+pgvector. Tool-calling RAG assistant driven by `chat`.
`README.md` (392 lines) is the reference for tools, config, evals and ingestion — read it
first. Docs: `documentation/developer/architecture/agent-architecture.qd`,
`contributing/adding-agent-tools.qd`.

## Layout

`app/agent/` (loop, prompts, `llm/`, `tools/`), `app/retrieval/`, `app/embeddings/`,
`app/chunking/`, `app/routes/`, `app/services/`, `app/models/`. Migrations in `alembic/`,
evals in `evals/`, tests in `tests/{unit,integration}/`.

## Invariants

**This is the untrusted-input service.** It feeds LLM output into tool calls, so it is the
one workload restricted by an Istio `AuthorizationPolicy` in the mesh, and both edges
**strip** any client-supplied `x-gateway-claims` on `/agent/*`. Nothing here may widen that.

**Two auth paths, one decision point** (`app/auth.py`): the `x-gateway-claims` header when
the call came through the mesh, or an HS256 eval token (`Authorization: Bearer`) for local
evals — because `/agent/*` is ungated at the edge, this service does its own check.

**Claims parsing is one definition per language.** `app/auth.py` is Python's; it asserts
`schemas/fixtures/standard-claims.json`, the same fixture the Go and Rust definitions assert
(`tests/unit/test_claims_conformance.py`; `test_schema_conformance.py` checks the fixture against
`schemas/json/*.schema.json`, `test_cedar_conformance.py` replays the auth-policy fixture). A renamed claim must fail in all three at once.

**Every tool enforces permissions itself** (`app/agent/tools/access.py`) — the model chooses
the tool, it never chooses the scope. `search_docs` results are permission-filtered.

**Citations are this service's wire shape.** chat stores and returns them as-is and refuses a
blanket camelCase rename on its side; keep the field names snake_case here.

**Answers stream as SSE** — `token` frames then a terminal frame carrying the authoritative
`answer` plus citations. chat trusts that final `answer` over the concatenated tokens, so
rewrites (stripped hallucinated citations, a preamble before a tool call) belong in it.

## Tests

```bash
just test agent               # unit
just test agent-integration   # integration, composed stack
mise exec -- uv run --directory backend/agent pytest tests/unit/test_x.py::test_y
just agent ingest             # re-ingest documentation into the knowledge base
```
