from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import text

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.retrieval.pipeline import RetrievedChunk


async def keyword_search(
    session: AsyncSession,
    query: str,
    limit: int,
    user_permissions: list[str],
) -> list[RetrievedChunk]:
    from app.retrieval.pipeline import RetrievedChunk

    sql = text(
        """
        SELECT c.id::text AS id,
               c.document_id::text AS document_id,
               c.content,
               c.section_path,
               c.kind,
               d.source,
               c.metadata,
               ts_rank(c.tsv, websearch_to_tsquery('english', :q)) AS score
        FROM chunks c
        JOIN documents d ON d.id = c.document_id
        WHERE c.tsv @@ websearch_to_tsquery('english', :q)
          AND (jsonb_array_length(c.permissions) = 0
               OR c.permissions ?| CAST(:perms AS text[]))
        ORDER BY score DESC
        LIMIT :limit
        """
    )
    result = await session.execute(
        sql, {"q": query, "perms": user_permissions or [], "limit": limit}
    )
    rows = result.mappings().all()
    return [
        RetrievedChunk(
            id=r["id"],
            document_id=r["document_id"],
            content=r["content"],
            section_path=r["section_path"],
            kind=r["kind"],
            source=r["source"],
            score=float(r["score"]),
            metadata=dict(r["metadata"] or {}),
        )
        for r in rows
    ]
