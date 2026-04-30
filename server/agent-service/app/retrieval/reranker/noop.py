from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.retrieval.pipeline import RetrievedChunk


class NoopReranker:
    async def rerank(self, query: str, candidates: list[RetrievedChunk]) -> list[RetrievedChunk]:
        return candidates
