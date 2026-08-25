from app.embeddings.base import Embedder
from app.embeddings.openai import OpenAIEmbedder

__all__ = ["Embedder", "OpenAIEmbedder", "get_embedder"]


def get_embedder() -> Embedder:
    return OpenAIEmbedder()
