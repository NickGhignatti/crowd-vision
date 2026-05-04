# Agent tools

The agent picks tools by reading their `name` + `description` and calls them with JSON arguments validated by a Pydantic `Args` model. This document lists every tool currently registered in [app/agent/tools/__init__.py](app/agent/tools/__init__.py).

## search_docs

**What it does.** Retrieves relevant chunks from the Crowd-Vision documentation knowledge base (concepts, how-tos, API references) using hybrid vector + keyword search.

**Backend.** Postgres (`pgvector` for semantic search + `tsvector` for keyword search), fused with Reciprocal Rank Fusion. See [app/retrieval/](app/retrieval/).

**Inputs.**

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Natural-language query. |
| `top_k` | int (1–10, default 5) | no | How many chunks to return. |

**Returns.** A list of chunks, each with `chunk_id`, `source`, `section`, `score`, `content`. Adds the chunks to `ctx.citations` so the answer can cite them via `[^chunk_id]` markers.

**When to use.** Anything about *how the platform works*: features, UI, architecture, API surface. **Not** for live operational state — use the twin tools for that.

---

## list_buildings

**What it does.** Lists all buildings registered in a given domain.

**Backend.** HTTP `GET /buildings/{domain}` on twin-service.

**Inputs.**

| Field | Type | Required | Description |
|---|---|---|---|
| `domain` | string | yes | Domain to list buildings for (use one of the caller's domains if unspecified). |

**Returns.** Slim list: `[{id, name, domains, room_count}]`.

**When to use.** "What buildings exist?", "Show buildings in domain X", or as a discovery step before drilling into a specific building.

---

## get_building

**What it does.** Fetches one building's full details — name, domains, and every room with capacity, occupancy, dimensions, and position.

**Backend.** HTTP `GET /building/{building_id}` on twin-service.

**Inputs.**

| Field | Type | Required | Description |
|---|---|---|---|
| `building_id` | string | yes | Unique id of the building (NOT its name). |

**Returns.** Full building JSON.

**When to use.** When you already have a `building_id` and need the full picture in one shot.

---

## list_rooms

**What it does.** Lists every room in a building with id, name, capacity, current occupancy (`no_person`), and temperature.

**Backend.** HTTP `GET /building/{building_id}` on twin-service (projected client-side).

**Inputs.**

| Field | Type | Required | Description |
|---|---|---|---|
| `building_id` | string | yes | Building whose rooms should be listed. |

**Returns.** `{building_id, building_name, rooms: [{id, name, capacity, no_person, temperature, max_temperature}]}`.

**When to use.** "Which rooms are full?", "How many rooms in building X?", or to find a room id by name before calling `get_room` / `get_occupancy_history`.

---

## get_room

**What it does.** Fetches one room's full *current* state: capacity, occupancy, temperature, dimensions, position.

**Backend.** HTTP `GET /building/{building_id}` on twin-service (filtered to the requested room).

**Inputs.**

| Field | Type | Required | Description |
|---|---|---|---|
| `building_id` | string | yes | Building containing the room. |
| `room_id` | string | yes | Id of the room within the building. |

**Returns.** Full room JSON.

**When to use.** Once you know the `room_id` (typically via `list_rooms`) and need its current snapshot. For *historical* occupancy, use `get_occupancy_history`.

---

## get_occupancy_history

**What it does.** Returns a time-bucketed occupancy series for a single room over the last day, week, or month.

**Backend.** HTTP `GET /peopleCount/dashboard?building=<id>&roomId=<id>&timeRange=<range>` on sensor-service. Aggregates raw people-count signals into hourly (1D) or daily (1W/1M) buckets.

**Inputs.**

| Field | Type | Required | Description |
|---|---|---|---|
| `building_id` | string | yes | Building containing the room. |
| `room_id` | string | yes | Room within the building. |
| `time_range` | `"1D"` \| `"1W"` \| `"1M"` (default `"1D"`) | no | Window size + bucket granularity. |

**Returns.**

```json
{
  "building_id": "...",
  "room_id": "...",
  "time_range": "1D",
  "summary": { "bucket_count": 24, "avg_overall": 4.2, "peak": { "timestamp": "...", "value": 12 } },
  "buckets":  [ { "timestamp": "...", "avg": 4, "min": 2, "max": 6 }, ... ]
}
```

**When to use.** Anything about *trends*, *peaks*, or *recent occupancy patterns*. For the *current* number, use `get_room`.

---

## What you can ask the LLM

The agent composes these tools, so most useful questions chain two or three of them. Examples:

### Documentation / how-it-works (search_docs)
- "How does Crowd-Vision authenticate users?"
- "What's the difference between domains and subdomains?"
- "How do I add a new room to a building from the UI?"
- "Which features support real-time updates?"
- "What is the explode view in the 3D model?"

### Inventory / discovery (list_buildings, list_rooms)
- "What buildings exist in the `engineering` domain?"
- "List all rooms in building `b-42`."
- "How many rooms does the main HQ have?"
- "Find a room called 'Aurora' — which building is it in?"

### Current state (get_building, get_room)
- "What's the current occupancy of room `r-7`?"
- "Is meeting room Aurora full right now?"
- "Show me the temperature in every room of building `b-42`."
- "What's the capacity vs. current people-count of room `r-7`?"

### Trends / history (get_occupancy_history)
- "What was the occupancy of room `r-7` over the past 24 hours?"
- "When did room Aurora hit its peak this week?"
- "Average occupancy of the boardroom in the last month?"
- "Was meeting room A busier this week than last week?" *(needs two calls)*

### Composite / multi-step (chains tools)
- "Which room in building `b-42` was the busiest yesterday?" — `list_rooms` → `get_occupancy_history` per room → compare peaks.
- "Are any rooms in the `engineering` domain currently over capacity?" — `list_buildings` → `list_rooms` → flag `no_person > capacity`.
- "Find the quietest room over the past week and tell me its capacity." — `list_rooms` → `get_occupancy_history` → `get_room`.
- "Explain how alerts work and then check whether room Aurora is currently triggering one." — `search_docs` (concept) → `list_rooms` (find id) → `get_room` (state).

### Things the agent will *not* do (today)
- Modify state — there are no write tools yet (no booking, no notifications, no edits).
- Answer "typically full at 3pm?" *across multiple days* in one shot — `get_occupancy_history` returns a contiguous series, not an hour-of-day pattern. The model can approximate from a `1W` series, but a dedicated pattern endpoint isn't available yet.
- Cross-domain queries the caller doesn't have permission for — retrieval and twin lookups are scoped by `ctx.user`.
