"""Smoke-test the configured OpenAI-compatible provider (OpenRouter by default).

Exercises a real chat call (with tool-calling), a real embedding call, and prints
the resolved settings + reported cost. No database or full stack required.

Run from server/agent-service with the provider key in the environment, e.g.:

    set -a; source ../../.env; set +a
    uv run python scripts/verify_provider.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.agent.llm import OpenAICompatClient
from app.agent.llm.base import ToolSchema
from app.config import get_settings
from app.embeddings import get_embedder


async def main() -> None:
    s = get_settings()
    print("── resolved settings ──")
    print(f"  base_url       : {s.llm_base_url}")
    print(f"  answer_model   : {s.answer_model}")
    print(f"  embedding_model: {s.embedding_model} (dim={s.embedding_dim})")
    print(
        f"  api_key set    : {bool(s.llm_api_key)} (…{s.llm_api_key[-4:] if s.llm_api_key else ''})"
    )
    print()

    # 1) Chat + tool-calling round-trip
    print("── chat() with a tool ──")
    client = OpenAICompatClient()
    weather = ToolSchema(
        name="get_weather",
        description="Get the current weather for a city.",
        parameters={
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    )
    turn = await client.chat(
        [{"role": "user", "content": "What's the weather in Paris? Use the tool."}],
        tools=[weather],
    )
    print(f"  model      : {turn.model}")
    print(f"  text       : {turn.text!r}")
    print(f"  tool_calls : {[(c.name, c.arguments) for c in turn.tool_calls]}")
    print(f"  tokens     : in={turn.usage.input_tokens} out={turn.usage.output_tokens}")
    print(f"  cost_usd   : {turn.usage.cost_usd}  (>0 means OpenRouter reported real cost)")
    print()

    # 2) Embedding round-trip
    print("── embed_query() ──")
    embedder = get_embedder()
    vec = await embedder.embed_query("crowd density at the north gate")
    print(f"  vector dim : {len(vec)} (expected {embedder.dim})")
    print(f"  sample     : {[round(x, 4) for x in vec[:5]]}")
    print()

    ok = bool(turn.text or turn.tool_calls) and len(vec) == embedder.dim
    print("RESULT:", "✅ provider is working" if ok else "❌ something is off — see above")


if __name__ == "__main__":
    asyncio.run(main())
