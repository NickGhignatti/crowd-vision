from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from app.retrieval.pipeline import RetrievedChunk


class Reranker(Protocol):
    async def rerank(
        self, query: str, candidates: list[RetrievedChunk]
    ) -> list[RetrievedChunk]: ...
