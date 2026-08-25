from app.config import get_settings
from app.retrieval.reranker.base import Reranker
from app.retrieval.reranker.noop import NoopReranker

__all__ = ["NoopReranker", "Reranker", "get_reranker"]


def get_reranker() -> Reranker:
    name = get_settings().reranker.lower()
    if name in {"noop", "", "none"}:
        return NoopReranker()
    raise ValueError(f"Unknown reranker: {name}")
