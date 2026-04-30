from app.embeddings.base import Embedder
from app.embeddings.gemini import GeminiEmbedder

__all__ = ["Embedder", "GeminiEmbedder", "get_embedder"]


def get_embedder() -> Embedder:
    return GeminiEmbedder()
