from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING

from sqlalchemy import text

from app.chunking import chunk_markdown
from app.logging import get_logger
from app.tracing import tracer

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.embeddings import Embedder

log = get_logger(__name__)


def _hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


async def ingest_document(
    session: AsyncSession,
    embedder: Embedder,
    source: str,
    content: str,
    metadata: dict,
    permissions: list[str],
) -> tuple[str, int, bool]:
    """Returns (document_id, chunks_written, skipped)."""
    tr = tracer()
    content_hash = _hash(content)

    existing = await session.execute(
        text("SELECT id::text AS id FROM documents WHERE content_hash = :h"),
        {"h": content_hash},
    )
    row = existing.mappings().first()
    if row:
        log.info("ingest.skipped", document_id=row["id"], source=source)
        return row["id"], 0, True

    with tr.start_as_current_span("ingest.chunk"):
        chunks = chunk_markdown(content)
    if not chunks:
        raise ValueError("no chunks produced from document")

    with tr.start_as_current_span("ingest.embed"):
        vectors = await embedder.embed([c.content for c in chunks])

    perms_json = json.dumps(permissions)
    meta_json = json.dumps(metadata)

    doc_row = await session.execute(
        text(
            """
            INSERT INTO documents (source, content_hash, metadata, permissions)
            VALUES (:source, :hash, CAST(:meta AS jsonb), CAST(:perms AS jsonb))
            RETURNING id::text AS id
            """
        ),
        {"source": source, "hash": content_hash, "meta": meta_json, "perms": perms_json},
    )
    document_id = doc_row.mappings().one()["id"]

    for chunk, vec in zip(chunks, vectors, strict=True):
        await session.execute(
            text(
                """
                INSERT INTO chunks (document_id, section_path, kind, content, token_count,
                                    embedding, permissions, metadata)
                VALUES (:doc, :section, :kind, :content, :tokens,
                        CAST(:vec AS vector), CAST(:perms AS jsonb), CAST(:meta AS jsonb))
                """
            ),
            {
                "doc": document_id,
                "section": chunk.section_path,
                "kind": chunk.kind,
                "content": chunk.content,
                "tokens": chunk.token_count,
                "vec": _vec_literal(vec),
                "perms": perms_json,
                "meta": json.dumps(chunk.metadata),
            },
        )

    await session.commit()
    log.info("ingest.ok", document_id=document_id, source=source, chunks=len(chunks))
    return document_id, len(chunks), False
