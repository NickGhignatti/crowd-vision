---
description: Read-only exploration (file reads, tree discovery, grep, command output) via Haiku 4.5 — cheap, fast, no heavy reasoning needed.
argument-hint: <what to find/read/discover>
---

Dispatch via the Agent tool, do not do this inline:

- `subagent_type`: `"Explore"`
- `model`: `"haiku"`
- `run_in_background`: `false` (its result is needed before continuing)
- prompt: the task below, plus explicit paths/patterns already known so the agent doesn't re-derive them

Task: $ARGUMENTS
