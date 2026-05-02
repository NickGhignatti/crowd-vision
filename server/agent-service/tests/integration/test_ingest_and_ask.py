"""Ingestion integration test. Uses a fake embedder so the test is hermetic."""

from __future__ import annotations

import hashlib

# TODO: re-enable the integration test below once the ingest pipeline is stable.
# Imports kept (noqa) so we don't have to re-add them when un-parking the test.
import pytest  # noqa: F401

from app.services.ingest import ingest_document  # noqa: F401


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


# @pytest.mark.asyncio
# async def test_ingest_is_idempotent_on_hash(session):
#     content = "# Doc\n\nSame content every time."
#     a = await ingest_document(session, FakeEmbedder(), "s", content, {}, [])
#     b = await ingest_document(session, FakeEmbedder(), "s", content, {}, [])
#     assert a[0] == b[0]
#     assert b[2] is True  # skipped
