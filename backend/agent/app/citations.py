from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.retrieval.pipeline import RetrievedChunk

_CITATION_RE = re.compile(r"\[\^([0-9a-fA-F-]{8,})\]")


@dataclass
class Citation:
    chunk_id: str
    document_id: str
    source: str
    section_path: str | None


def extract_citations(
    text: str, retrieved: list[RetrievedChunk]
) -> tuple[list[Citation], list[str]]:
    """Return (valid_citations, hallucinated_ids). Dedupes while preserving order."""
    seen: set[str] = set()
    valid: list[Citation] = []
    hallucinated: list[str] = []
    by_id = {c.id: c for c in retrieved}

    for match in _CITATION_RE.finditer(text):
        cid = match.group(1)
        if cid in seen:
            continue
        seen.add(cid)
        chunk = by_id.get(cid)
        if chunk is None:
            hallucinated.append(cid)
            continue
        valid.append(
            Citation(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                source=chunk.source,
                section_path=chunk.section_path,
            )
        )
    return valid, hallucinated


def strip_hallucinated(text: str, hallucinated: list[str]) -> str:
    if not hallucinated:
        return text
    pattern = re.compile(r"\[\^(?:" + "|".join(re.escape(h) for h in hallucinated) + r")\]")
    return pattern.sub("", text)
