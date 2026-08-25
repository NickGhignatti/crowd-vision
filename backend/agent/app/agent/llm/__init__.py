from functools import lru_cache

from app.agent.llm.base import CompletionUsage, LLMClient
from app.agent.llm.openai_compat import OpenAICompatClient


@lru_cache(maxsize=16)
def get_llm(model: str | None = None) -> OpenAICompatClient:
    """Return a chat client for the given model id (None ⇒ the configured default).

    Cached per model so a multi-model eval sweep reuses one AsyncOpenAI client per
    model instead of leaking a new connection pool on every request.
    """
    return OpenAICompatClient(model=model)


__all__ = ["CompletionUsage", "LLMClient", "OpenAICompatClient", "get_llm"]
