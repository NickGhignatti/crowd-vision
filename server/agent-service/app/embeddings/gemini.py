from __future__ import annotations

import asyncio

import google.genai as genai

from app.config import get_settings


class GeminiEmbedder:
    def __init__(self) -> None:
        settings = get_settings()
        self._client = genai.Client(api_key=settings.google_api_key)
        self._model = settings.embedding_model
        self._timeout = settings.embed_timeout_seconds
        self.dim = settings.embedding_dim

    async def _embed_one(self, text: str, task_type: str) -> list[float]:
        def _call() -> list[float]:
            result = self._client.models.embed_content(
                model=self._model,
                contents=text,
                config={"task_type": task_type, "output_dimensionality": self.dim},
            )
            if not result.embeddings or result.embeddings[0].values is None:
                raise RuntimeError("Gemini embed_content returned no embeddings")
            return list(result.embeddings[0].values)

        return await asyncio.wait_for(asyncio.to_thread(_call), timeout=self._timeout)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.gather(*[self._embed_one(t, "RETRIEVAL_DOCUMENT") for t in texts])

    async def embed_query(self, text: str) -> list[float]:
        return await self._embed_one(text, "RETRIEVAL_QUERY")
