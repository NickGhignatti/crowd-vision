# Evals — golden dataset

`dataset.jsonl` is the **golden dataset**: hand-written questions, each paired with
the behaviour we expect from the agent. One JSON object per line.

For every row we record the **input** plus the **expected behaviour**: which document
the retrieval should surface (`expected_sources`), which tool should be called
(`expected_tool`), and either an `ideal_answer` or the `key_facts` / `expected_keywords`
the answer must contain.

| field               | required | meaning                                                                          |
| ------------------- | -------- | -------------------------------------------------------------------------------- |
| `id`                | yes      | Stable id, e.g. `cv-doc-001`                                                      |
| `category`          | no       | `docs_retrieval` · `live_data` · `conversational` · `out_of_scope` (curation aid) |
| `question`          | yes      | The prompt sent to `/ask`                                                         |
| `expected_tool`     | no       | Tool that must appear in the agent's tool-call trace (`search_docs`, `list_buildings`, `get_building`, `list_rooms`, `get_room`) |
| `expected_no_tool`  | no       | If true, the agent must answer **without** calling any tool (greetings)          |
| `expected_sources`  | no       | Repo-relative doc path(s); ≥1 citation source must match (substring)             |
| `must_cite`         | no       | If true, the answer must include at least one citation                           |
| `expected_keywords` | no       | Lowercase substrings that must all appear in the answer                          |
| `key_facts`         | no       | Human-readable facts the answer should convey (reference, not auto-scored)       |
| `ideal_answer`      | no       | A model answer (reference, not auto-scored)                                      |
| `expected_idk`      | no       | If true, response `idk` must be true (out-of-scope / unknown)                    |

**Notes on what the agent can actually emit:** `decision` is only `answered` or
`tool_loop_exhausted`. There is no `out_of_scope` / `clarification_needed` decision —
unknown or off-topic questions surface as `idk: true` (the IDK marker), and greetings
are simply answered with no tool call. The dataset reflects this.

Chunk ids are UUIDs assigned at ingest and are **not stable** across re-ingests, so
retrieval expectations are expressed as the source document path, never a chunk id.

## Running

```bash
# 1. Bring up the stack and let agent-ingester load documentation/ (see ../README.md).
# 2. Mint a JWT whose domain has seeded buildings (for the live_data rows), then:
AGENT_URL=http://localhost/agent \
AUTH_COOKIE="authentication_token=<jwt>" \
uv run python evals/run_evals.py
```

`run_evals.py` prints per-row PASS/FAIL with latency and cost, then a summary
(`passed/total`, total cost, avg latency). Exit code is non-zero if any row fails,
so it can gate CI.

## Comparing models (A/B)

The `/ask` endpoint takes an optional `model` (any OpenRouter id) that overrides the
chat model for that request only — embeddings and retrieval are unchanged, so you're
comparing generators on identical context. `run_evals.py --models a,b,c` runs the
whole dataset once per model and prints a comparison table:

```bash
AGENT_URL=http://localhost/agent AUTH_COOKIE="authentication_token=<jwt>" \
uv run python evals/run_evals.py \
  --models openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat
# ⇒ per-model PASS/FAIL, then: model | pass | pass% | cost $ | avg ms
```

No `--models` ⇒ a single run against the server's default `ANSWER_MODEL`. Each run
also tags its Langfuse traces `model:<id>`, so you can filter/group by model in the UI
to compare cost, tokens, and latency on the same questions.

## Growing the set

- Add a row for each major doc section and each tool path you care about.
- When a user reports a wrong answer, add it here **before** fixing, so the fix is verified.
- Keep `expected_keywords` to 1–2 robust tokens to avoid flaky phrasing failures; put
  the fuller expectation in `key_facts` / `ideal_answer`.
- Live-data rows can't pin numbers (data changes) — assert the tool and grounding
  instead, and rely on `key_facts` for the qualitative bar.
