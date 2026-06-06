# Adding an Agent Tool

A "tool" is a capability the LLM can call (search docs, fetch a building, send a notification...). The agent loop ([app/agent/loop.py](app/agent/loop.py)) discovers tools through the `REGISTRY`, validates the model's JSON arguments through your Pydantic `Args`, calls `run`, and feeds the result back into the conversation.

This guide walks through adding one end-to-end.

## 1. Pick the shape

Before writing code, answer four questions:

1. **What does the tool do, in one sentence?** This becomes the `description` the LLM reads.
2. **What inputs does it need?** Each input becomes a field on the `Args` Pydantic model.
3. **What does it return?** Keep payloads small — the result is fed back into the LLM context as JSON. Project away fields the model doesn't need.
4. **Read-only or write?** The current agent has no confirmation flow for write actions.
   Keep tools read-only unless authorization, confirmation, audit logging, and retry
   behavior are explicitly designed.

## 2. Where the file lives

- **Single tool, focused domain** → new file in `app/agent/tools/<name>.py`.
- **Cluster of related tools sharing a backend** → group them in one file (see [app/agent/tools/twin.py](app/agent/tools/twin.py) — four tools sharing the `httpx.AsyncClient` against twin-service).

Use `# ─── tool_name ──...` divider comments inside multi-tool files to keep them scannable.

## 3. Write the `Args` model

```python
from pydantic import BaseModel, Field


class GetRoomArgs(BaseModel):
    building_id: str = Field(description="Building containing the room.")
    room_id: str = Field(description="Id of the room within the building.")
```

Best practices:

- **Every field gets a `Field(description=...)`.** That description is the *only* thing the LLM sees about that argument — vague descriptions cause vague tool calls.
- **Use the right primitive** (`str`, `int`, `bool`, `Literal[...]`, enums). Pydantic enforces it; the LLM sees it in the JSON Schema.
- **Add constraints** where they help: `Field(default=5, ge=1, le=10)` (see [search_docs.py](app/agent/tools/search_docs.py)).
- **Keep names plain.** `building_id` not `bldgIdentifier`. The LLM produces these names from the schema.
- **Resist the urge to make everything optional.** Required-by-default produces fewer "I forgot to pass that" tool errors.

## 4. Write the tool class

```python
from app.agent.tools.base import ToolContext, ToolResult


class GetRoomTool:
    name = "get_room"
    description = (
        "Fetch a single room's full state: capacity, current occupancy, temperature, "
        "dimensions, position. Use after locating the room id via list_rooms."
    )
    Args = GetRoomArgs

    async def run(self, args: GetRoomArgs, ctx: ToolContext) -> ToolResult:
        ...
```

Required attributes:

| Attribute     | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | Stable identifier the LLM emits in `tool_calls`. Snake_case, unique.    |
| `description` | What the tool does *and when to use it vs. alternatives*. See below.   |
| `Args`        | The Pydantic class from step 3. The registry calls `Args.model_json_schema()` to expose it to the LLM. |
| `run`         | Async method, signature `(self, args: <YourArgs>, ctx: ToolContext) -> ToolResult`. |

### Writing a good `description`

The LLM uses this to choose between tools. State **what it does** *and* **when to pick it over neighbors**. Compare:

- ❌ "Get a room." — too thin. Model will guess.
- ✅ "Fetch a single room's full state... Use *after* locating the room id via `list_rooms`." — names the precondition and steers the model away from cold-calling with a guessed id.

For tools with a sibling that does something close (`search_docs` vs. twin tools), explicitly say *what it is NOT for* — see `SearchDocsTool` in [search_docs.py](app/agent/tools/search_docs.py).

### About the generic protocol

[`Tool`](app/agent/tools/base.py) is `Protocol[ArgsT]` — generic over your `Args` type. You **do not** inherit from it; structural typing means as long as your class has `name`, `description`, `Args`, and a matching `run`, it satisfies `Tool[YourArgs]`. The TypeVar is what lets pyright see that `run(args: GetRoomArgs, ...)` is a valid implementation rather than an LSP violation.

Do **not** widen your `run` parameter to `BaseModel` to "match the protocol" — that defeats the whole point. Keep it narrow.

## 5. Implement `run`

```python
async def run(self, args: GetRoomArgs, ctx: ToolContext) -> ToolResult:
    async with _client() as c:
        r = await c.get(f"/building/{args.building_id}")
    if r.status_code == 404:
        return ToolResult(content=f"building {args.building_id} not found", is_error=True)
    if r.status_code >= 400:
        return ToolResult(content=f"twin-service error {r.status_code}: {r.text}", is_error=True)
    ...
    return ToolResult(content=room)
```

Rules of thumb:

- **Return errors as data, don't raise.** Use `ToolResult(content=<message>, is_error=True)`. The agent loop already catches uncaught exceptions, but a clean `is_error` message gives the model a chance to recover (try a different building id, ask the user, etc.). Raising is for genuine bugs.
- **Use `ctx`**:
  - `ctx.session` — async SQLAlchemy session for Postgres queries.
  - `ctx.user` — the authenticated `AuthUser` (roles, domains, permissions). Use this to enforce per-tool RBAC.
  - `ctx.citations` — accumulated citation candidates from completed tools. Prefer
    returning new citations through `ToolResult(citations=[...])`; the agent loop appends
    them to the context (see `SearchDocsTool`).
- **Project the response.** When wrapping an HTTP call, return only the fields the LLM needs. Big payloads waste tokens and confuse the model.
- **No prints, use `structlog`.** `from app.logging import get_logger; log = get_logger(__name__)`.
- **No global state in `run`.** Module-level singletons (a shared `httpx.AsyncClient`, a retriever) are fine — *per-call* state belongs in `ctx` or local variables.

## 6. Register the tool

Open [app/agent/tools/__init__.py](app/agent/tools/__init__.py) and add two lines:

```python
from app.agent.tools.twin import GetRoomTool  # already there for twin tools
...
REGISTRY.register(GetRoomTool())
```

Order doesn't matter. Duplicate `name`s raise at startup — that's intentional.

## 7. Test it

Three layers, lightest first:

### 7a. Unit test the `Args` model

If you put non-trivial validation on the args (regex, ranges, custom validators), unit-test it under [tests/unit/](tests/unit/). Don't bother for trivial fields.

### 7b. Unit test `run` with a fake backend

Inject a fake client/session and assert on the `ToolResult`. Pattern: mock the *boundary* (httpx, SQLAlchemy session), not the tool itself.

### 7c. Integration test through the agent loop

The current integration suite does not provide a reusable scripted-`LLMClient` harness.
For now, test `run` at the backend boundary and manually smoke-test dispatch through `/ask`.
When adding a reusable fake LLM, assert the full tool-call and recovery sequence through
`Agent.answer`.

## 8. Run the checks

```bash
npm run lint       # ruff + pyright, must be clean
npm run test       # unit + integration
```

Pyright will catch the most common mistakes here:

- Forgetting to set `Args` (registry can't build the schema).
- `run` parameter type doesn't match `Args` (the generic protocol won't accept it).
- Returning the wrong shape from `run` (must be `ToolResult`).

## Quick checklist

- [ ] File in `app/agent/tools/<name>.py` (or grouped sensibly with siblings).
- [ ] `Args` is a `BaseModel`; every field has a `Field(description=...)`.
- [ ] Class has `name` (snake_case, unique), `description` (with *when to use*), `Args`, async `run`.
- [ ] `run(args: <YourArgs>, ctx: ToolContext) -> ToolResult` — narrow types, no widening to `BaseModel`.
- [ ] Errors returned as `ToolResult(..., is_error=True)`, not raised.
- [ ] Response projected to the minimum the LLM needs.
- [ ] Registered in [app/agent/tools/__init__.py](app/agent/tools/__init__.py).
- [ ] `npm run lint` and `npm run test` pass.
