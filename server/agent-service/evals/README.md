# Evals

`dataset.jsonl` — one JSON object per line:

| field              | required | meaning                                                  |
| ------------------ | -------- | -------------------------------------------------------- |
| `id`               | yes      | Stable id, e.g. `cv-011`                                 |
| `question`         | yes      | The prompt sent to `/ask`                                |
| `expected_keywords`| no       | Lowercase substrings that must appear in the answer      |
| `expected_source`  | no       | Documentary hint; not scored, useful when curating       |
| `must_cite`        | no       | If true, answer must include at least one citation       |
| `expected_idk`     | no       | If true, response `idk` must be true                     |
| `expected_decision`| no       | One of `answerable`/`out_of_scope`/`clarification_needed`|

## Running

```bash
# ingest your corpus first (see ../README.md), then:
AGENT_URL=http://localhost/agent \
AUTH_COOKIE="token=<jwt>" \
uv run python evals/run_evals.py
```

## Growing the set

- Add entries covering each major doc section you care about.
- Target ~100 rows for meaningful regression signal.
- Balance: ~60% answerable, ~20% out-of-scope, ~10% clarification, ~10% IDK.
- When a user reports a wrong answer, add it here before fixing so the fix is verified.
