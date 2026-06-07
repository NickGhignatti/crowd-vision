# Evals — golden dataset

`dataset.json` is the **golden dataset**: a formatted JSON array of hand-written
questions, each paired with the behaviour we expect from the agent.

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
| `xfail`             | no       | If true, an assertion failure is an accepted, tracked gap reported as `XFAIL`    |
| `xfail_reason`      | with `xfail` | Required explanation of the accepted gap and when to revisit it               |

**Notes on what the agent can actually emit:** `decision` is only `answered` or
`tool_loop_exhausted`. There is no `out_of_scope` / `clarification_needed` decision —
unknown or off-topic questions surface as `idk: true` (the IDK marker), and greetings
are simply answered with no tool call. The dataset reflects this.

Chunk ids are UUIDs assigned at ingest and are **not stable** across re-ingests, so
retrieval expectations are expressed as the source document path, never a chunk id.

## Running

```bash
# 1. Bring up the stack and let agent-ingester load documentation/user + documentation/developer.
# 2. From the repository root:
just eval

# Or directly from server/agent-service:
uv run python evals/run_evals.py
```

`run_evals.py` prints per-row results with latency and cost, then a summary
(`passed/total`, xfail/xpass/fail, total cost, avg latency). `passed` counts rows
whose assertions succeeded, including `XPASS`; `XFAIL` is not counted as passed.

**Exit code & known gaps (xfail).** A row tagged `"xfail": true` (with a required
`"xfail_reason"`) is an *accepted, tracked* failure:

| status | meaning | exits non-zero? |
| ------ | ------- | --------------- |
| `PASS`  | assertions met | no |
| `FAIL`  | unexpected assertion regression or infrastructure error, including timeout, non-200, or malformed JSON | **yes** |
| `XFAIL` | an `xfail` row failed its assertions, as expected | no |
| `XPASS` | an `xfail` row now passes; it counts as passed but its marker is stale | only with `--strict` |

Direct runner invocations exit non-zero on real regressions/outages but stay green for
documented gaps. Infra errors **always** report `FAIL`, even on an `xfail` row, so an
outage can't masquerade as an accepted gap. Use `--strict` (CI on a pinned baseline
model) to also fail on `XPASS`, forcing stale markers to be removed.

`just eval` is the interactive report command. It passes `--report-only`, so scored
`FAIL` and `XPASS` results remain visible but do not produce `error: recipe 'eval'
failed`. Setup and preflight errors such as an unreachable service, invalid
authentication, or an unauthorized model still fail the recipe.

For example:

```text
(default): 15/16 passed | 1 xfail, 0 xpass, 0 fail | cost $0.0141 | avg latency 9207ms
```

This run exits zero because its only assertion failure is a documented known gap. A
direct runner invocation exits non-zero when the summary reports one or more `fail`;
`just eval` reports them without failing the recipe. Find the preceding `[FAIL]
<row-id> ...` line for the exact reason. The total cost includes the preflight request;
average latency covers the scored dataset rows.

For local URLs, the runner reads `JWT_SECRET` from the environment or root `.env` and
mints a fresh five-minute JWT for every request. The defaults are role `admin`, domain
`unibo.it`, and cookie name `authentication_token`; override them with `--role`,
`--domain`, and `--cookie-name`.

```bash
uv run python evals/run_evals.py \
  --role business_admin \
  --domain unibo.it \
  --cookie-name authentication_token
```

Automatic JWT minting is restricted to `localhost`, loopback addresses, and the local
Docker hostnames `agent-service` and `host.docker.internal`. Remote and CI runs must
provide a cookie explicitly; `AUTH_COOKIE` always takes precedence over automatic minting:

```bash
AGENT_URL=https://example.com/agent \
AUTH_COOKIE="authentication_token=<jwt>" \
uv run python evals/run_evals.py
```

Before each model run, the harness makes one preflight model request to check
service/database health, authentication, and model-override authorization. Its cost is
included in the model's total. Corpus ingestion cannot be reliably distinguished from a
retrieval-quality failure through the current API, so missing-document behavior remains
part of the scored results.

Common preflight failures:

| Message/status | Meaning |
| --- | --- |
| Agent unreachable / degraded | Start the stack and verify the agent database |
| `401` | `JWT_SECRET` does not match the running service, or `AUTH_COOKIE` is invalid |
| `403` | The eval role cannot use per-request model overrides |
| `400` during a model sweep | The requested model is excluded by `ALLOWED_MODELS` |

## Comparing models (A/B)

The `/ask` endpoint takes an optional `model` that overrides the chat model for that request
only. The embedding model and indexed corpus stay fixed, but each answer model independently
chooses tools and search queries. This is therefore an **end-to-end agent comparison**, not a
generator-only comparison over frozen context.

> **Privileged.** Because the override spends the shared OpenRouter balance, it is
> gated: the caller's JWT must hold a role at/above `MODEL_OVERRIDE_MIN_ROLE`
> (default `business_admin`) or `/ask` returns **403**, and when `ALLOWED_MODELS`
> is set the model must be in it (else **400**). Mint an admin/business_admin JWT
> for the eval token. An empty `ALLOWED_MODELS` permits any model for callers that
> satisfy the role gate.

`just eval models="a,b,c"` runs the whole dataset once per model and prints a comparison
table:

```bash
just eval models="openai/gpt-4o-mini,google/gemini-2.5-flash,deepseek/deepseek-chat"
# ⇒ per-model statuses, then: model | pass | pass% | xfail | xpass | fail | cost $ | avg ms
```

No `--models` ⇒ a single run against the server's default `ANSWER_MODEL`. Each run
also tags its Langfuse traces `model:<id>`, so you can filter/group by model in the UI
to compare cost, tokens, and latency on the same questions.

Model sweeps make real provider requests and can make several LLM calls per question because
of the tool loop. Keep `MAX_OUTPUT_TOKENS`, `MAX_TOOL_HOPS`, and `ALLOWED_MODELS` bounded
before running large sweeps.

## Command Reference

| Command | Purpose |
| --- | --- |
| `just eval` | Interactively evaluate the configured model; report scored failures without failing the recipe |
| `just eval models="a,b"` | Interactively evaluate and compare models without failing on scored results |
| `uv run python evals/run_evals.py` | Direct local invocation from `server/agent-service` |
| `MODELS=a,b uv run python evals/run_evals.py` | Direct model sweep using an environment variable |
| `uv run python evals/run_evals.py --strict` | Also exit non-zero when an `xfail` row passes |
| `uv run python evals/run_evals.py --report-only` | Report scored failures but exit zero; setup/preflight errors still fail |
| `EVAL_TIMEOUT_SECONDS=240 uv run python evals/run_evals.py` | Increase the per-request timeout |
| `AGENT_URL=... AUTH_COOKIE=... uv run python evals/run_evals.py` | Evaluate a remote/CI deployment |

## Growing the set

- Add a row for each major doc section and each tool path you care about.
- When a user reports a wrong answer, add it here **before** fixing, so the fix is verified.
- Use `xfail` only for accepted, tracked gaps and always provide an actionable
  `xfail_reason`; remove the marker when the row reports `XPASS`.
- Keep `expected_keywords` to 1–2 robust tokens to avoid flaky phrasing failures; put
  the fuller expectation in `key_facts` / `ideal_answer`.
- Live-data rows can't pin numbers (data changes) — assert the tool and grounding
  instead, and rely on `key_facts` for the qualitative bar.
