from __future__ import annotations

from pydantic import BaseModel, Field

from app.agent.tools.base import ToolContext, ToolResult
from app.embeddings import get_embedder
from app.retrieval import HybridRetriever
from app.retrieval.reranker import get_reranker

_retriever = HybridRetriever(embedder=get_embedder(), reranker=get_reranker())


class SearchDocsArgs(BaseModel):
    query: str = Field(description="Natural-language query to search the documentation index.")
    top_k: int = Field(default=5, ge=1, le=10, description="Number of chunks to return.")


class SearchDocsTool:
    name = "search_docs"
    description = (
        "Search the Crowd-Vision documentation knowledge base (concepts, how-tos, API "
        "references). Use for questions about how the platform works, what features exist, "
        "or how to use the UI. Do NOT use for live operational state — use the twin tools "
        "for building structure and the sensor tools for live measurements."
    )
    Args = SearchDocsArgs

    async def run(self, args: SearchDocsArgs, ctx: ToolContext) -> ToolResult:
        retrieved = await _retriever.retrieve(ctx.session, args.query, ctx.user.permissions)
        if not retrieved:
            return ToolResult(content={"chunks": [], "note": "no relevant docs found"})

        chunks = retrieved[: args.top_k]
        payload = [
            {
                "chunk_id": c.id,
                "source": c.source,
                "section": c.section_path,
                "score": round(c.score, 4),
                "content": c.content,
            }
            for c in chunks
        ]
        return ToolResult(content={"chunks": payload}, citations=chunks)
