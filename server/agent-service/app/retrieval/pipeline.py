from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.config import get_settings
from app.retrieval.keyword import keyword_search
from app.retrieval.vector import vector_search
from app.tracing import tracer

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.embeddings import Embedder
    from app.retrieval.reranker import Reranker


@dataclass
class RetrievedChunk:
    id: str
    document_id: str
    content: str
    section_path: str | None
    kind: str
    source: str
    score: float
    metadata: dict


def _rrf_merge(
    vector_hits: list[RetrievedChunk],
    keyword_hits: list[RetrievedChunk],
    k: int = 60,
) -> list[RetrievedChunk]:
    """Reciprocal rank fusion of two ranked lists."""
    scores: dict[str, float] = {}
    lookup: dict[str, RetrievedChunk] = {}
    for ranked_list in (vector_hits, keyword_hits):
        for rank, hit in enumerate(ranked_list):
            scores[hit.id] = scores.get(hit.id, 0.0) + 1.0 / (k + rank + 1)
            lookup[hit.id] = hit

    merged = sorted(lookup.values(), key=lambda c: scores[c.id], reverse=True)
    for c in merged:
        c.score = scores[c.id]
    return merged


class HybridRetriever:
    def __init__(self, embedder: Embedder, reranker: Reranker) -> None:
        self._embedder = embedder
        self._reranker = reranker
        self._settings = get_settings()

    async def retrieve(
        self,
        session: AsyncSession,
        question: str,
        user_permissions: list[str],
    ) -> list[RetrievedChunk]:
        tr = tracer()
        with tr.start_as_current_span("retrieve.embed"):
            query_vec = await self._embedder.embed_query(question)

        with tr.start_as_current_span("retrieve.vector") as span:
            span.set_attribute("retrieve.top_k", self._settings.top_k_vector)
            vector_hits = await vector_search(
                session,
                query_vec,
                limit=self._settings.top_k_vector,
                user_permissions=user_permissions,
            )
            span.set_attribute("retrieve.hits", len(vector_hits))

        with tr.start_as_current_span("retrieve.keyword") as span:
            span.set_attribute("retrieve.top_k", self._settings.top_k_keyword)
            keyword_hits = await keyword_search(
                session,
                question,
                limit=self._settings.top_k_keyword,
                user_permissions=user_permissions,
            )
            span.set_attribute("retrieve.hits", len(keyword_hits))

        merged = _rrf_merge(vector_hits, keyword_hits)

        with tr.start_as_current_span("retrieve.rerank") as span:
            reranked = await self._reranker.rerank(question, merged)
            span.set_attribute("retrieve.merged", len(merged))
            span.set_attribute("retrieve.final", min(len(reranked), self._settings.top_k_final))

        return reranked[: self._settings.top_k_final]
