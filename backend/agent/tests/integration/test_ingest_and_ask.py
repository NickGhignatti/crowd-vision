"""Ingestion integration test. Uses a fake embedder so the test is hermetic."""

from __future__ import annotations

import hashlib

import pytest

from app.services.ingest import ingest_document

# Every test here shares the session-scoped engine, so it shares its loop.
pytestmark = pytest.mark.asyncio(loop_scope="session")


class FakeEmbedder:
    dim = 768

    def _vec(self, text: str) -> list[float]:
        h = hashlib.sha256(text.encode()).digest()
        vals: list[float] = []
        for i in range(768):
            b = h[i % len(h)]
            vals.append(((b + i * 7) % 251) / 251.0 - 0.5)
        norm = sum(v * v for v in vals) ** 0.5 or 1.0
        return [v / norm for v in vals]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    async def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


async def test_ingest_is_idempotent_on_hash(session):
    content = "# Doc\n\nSame content every time."
    a = await ingest_document(session, FakeEmbedder(), "s", content, {}, [])
    b = await ingest_document(session, FakeEmbedder(), "s", content, {}, [])
    assert a[0] == b[0]
    assert b[2] is True
    assert a[1] > 0
    assert b[1] == 0


async def test_a_document_with_no_chunkable_content_is_rejected(session):
    # Writing a document row with zero chunks would leave something that can never
    # be retrieved, and its hash would then suppress a later, good re-ingest.
    with pytest.raises(ValueError, match="no chunks"):
        await ingest_document(session, FakeEmbedder(), "s", "   \n\n  ", {}, [])
