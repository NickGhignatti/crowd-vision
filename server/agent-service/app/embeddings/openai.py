from __future__ import annotations

from openai import AsyncOpenAI

from app.config import get_settings


class OpenAIEmbedder:
    """Embedder for any OpenAI-compatible endpoint (OpenRouter, OpenAI, …).

    Uses the `dimensions` parameter so the output width matches `embedding_dim`
    (the pgvector column size), keeping the schema stable across models that
    support Matryoshka-style truncation (e.g. text-embedding-3-*).
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._client = AsyncOpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            timeout=settings.embed_timeout_seconds,
        )
        self._model = settings.embedding_model
        self.dim = settings.embedding_dim

    async def _embed(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.embeddings.create(
            model=self._model,
            input=texts,
            dimensions=self.dim,
        )
        # The API may return items out of order; sort by index to be safe.
        ordered = sorted(resp.data, key=lambda d: d.index)
        return [list(d.embedding) for d in ordered]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return await self._embed(texts)

    async def embed_query(self, text: str) -> list[float]:
        return (await self._embed([text]))[0]
